import sql from "../../../config/db.js";
import {
  sendAdvancePaymentEmail,
  sendFullPaymentEmail,
  sendUserEmailSafe,
} from "../../common/email.service.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import {
  fetchOrderNotifyContext,
  orderConfirmedTemplate,
} from "../../../utils/userNotificationTemplates.js";
import { PAYMENT_TYPE } from "../../../utils/status.js";
import {
  fulfillCapturedPayment,
  isPaymentAlreadyProcessed,
  recordFailedPayment,
} from "./paymentFulfillment.service.js";
import {
  RELEVANT_WEBHOOK_EVENTS,
  extractInternalOrderId,
  extractPaymentNotes,
  parseWebhookBody,
  verifyWebhookSignature,
} from "./razorpay.util.js";

const insertWebhookEvent = async ({
  event,
  eventKey,
  razorpayPaymentId,
  orderId,
  signatureValid,
  status,
  errorMessage,
  payload,
}) => {
  try {
    await sql.query(
      `INSERT INTO payment_webhook_events
         (provider, event, event_key, razorpay_payment_id, order_id,
          signature_valid, status, error_message, payload)
       VALUES ('razorpay',$1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        event || null,
        eventKey || null,
        razorpayPaymentId || null,
        orderId != null ? orderId : null,
        signatureValid,
        status,
        errorMessage || null,
        payload != null ? JSON.stringify(payload) : null,
      ],
    );
  } catch (error) {
    console.error("[razorpay-webhook] Failed to write payment_webhook_events:", error.message);
  }
};

const sendPaymentNotifications = async (result, paymentMethod = "razorpay") => {
  if (result.alreadyProcessed) return;

  const { rows: orderMeta } = await sql.query(
    `SELECT order_code FROM orders WHERE id = $1`,
    [result.order_id],
  );
  const orderCode = orderMeta[0]?.order_code;

  if (result.payment_type === PAYMENT_TYPE.ADVANCE) {
    const ctx = await fetchOrderNotifyContext(result.order_id);
    const confirmed = orderConfirmedTemplate({
      name: ctx?.name,
      orderCode: ctx?.orderCode || orderCode,
      orderId: result.order_id,
      pickupDate: ctx?.pickupDate,
      pickupSlot: ctx?.pickupSlot,
    });

    await createNotificationsBatch([
      {
        identity_id: result.user_id,
        role: "user",
        title: confirmed.title,
        message: confirmed.message,
        reference_type: "order",
        reference_id: result.order_id,
        data: confirmed.data,
      },
      {
        identity_id: result.vendor_id,
        role: "vendor",
        title: "New Order Assigned",
        message: `Order #${result.order_id} has been assigned to your laundry. A rider will deliver it to you on the pickup date.`,
        reference_type: "order",
        reference_id: result.order_id,
      },
    ]);

    sendUserEmailSafe(result.user_id, sendAdvancePaymentEmail, {
      orderId: result.order_id,
      orderCode,
      amount: result.paidAmount,
    });
    return;
  }

  await createNotificationsBatch([
    {
      identity_id: result.user_id,
      role: "user",
      title: "Payment Complete",
      message: `Payment of ₹${result.paidAmount} received for order #${result.order_id}. Thank you!`,
      reference_type: "order",
      reference_id: result.order_id,
    },
  ]);

  sendUserEmailSafe(result.user_id, sendFullPaymentEmail, {
    orderId: result.order_id,
    orderCode,
    amount: result.paidAmount,
    paymentMethod,
  });
};

export const handleRazorpayWebhook = async (body, signature) => {
  const { rawBody, payload } = parseWebhookBody(body);
  const event = payload?.event || null;
  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;
  const razorpayPaymentId = paymentEntity?.id || null;
  const eventKey = `${event || "unknown"}:${razorpayPaymentId || payload?.id || Date.now()}`;

  if (!verifyWebhookSignature(rawBody, signature)) {
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId,
      orderId: null,
      signatureValid: false,
      status: "invalid_signature",
      errorMessage: "Invalid webhook signature",
      payload,
    });
    return { status: 400, body: { success: false, message: "Invalid webhook signature" } };
  }

  if (!RELEVANT_WEBHOOK_EVENTS.has(event)) {
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId,
      orderId: null,
      signatureValid: true,
      status: "ignored",
      payload,
    });
    return { status: 200, body: "OK" };
  }

  if (!paymentEntity?.id) {
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId: null,
      orderId: null,
      signatureValid: true,
      status: "ignored",
      errorMessage: "Missing payment entity id",
      payload,
    });
    return { status: 200, body: "OK" };
  }

  const orderId = extractInternalOrderId(paymentEntity, orderEntity);
  if (!orderId) {
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId,
      orderId: null,
      signatureValid: true,
      status: "failed",
      errorMessage: "internal_order_id not found in payment notes or receipt",
      payload,
    });
    return {
      status: 400,
      body: { success: false, message: "internal_order_id not found in payment notes or receipt" },
    };
  }

  const paymentNotes = extractPaymentNotes(paymentEntity, orderEntity);
  const paymentPayload = {
    orderId,
    razorpayPaymentId: paymentEntity.id,
    amount: Number(paymentEntity.amount || 0) / 100,
    paymentMethod: paymentEntity.method || "razorpay",
    paymentType: paymentNotes.payment_type,
    assignmentMeta: {
      group_code: paymentNotes.group_code,
      shift_id: paymentNotes.shift_id,
      day_of_week: paymentNotes.day_of_week,
    },
  };

  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    if (await isPaymentAlreadyProcessed(client, paymentPayload.razorpayPaymentId)) {
      await client.query("COMMIT");
      await insertWebhookEvent({
        event,
        eventKey,
        razorpayPaymentId,
        orderId,
        signatureValid: true,
        status: "duplicate",
        payload,
      });
      return { status: 200, body: "OK" };
    }

    if (event === "payment.captured") {
      const result = await fulfillCapturedPayment({ client, ...paymentPayload });
      await client.query("COMMIT");
      await insertWebhookEvent({
        event,
        eventKey,
        razorpayPaymentId,
        orderId,
        signatureValid: true,
        status: "processed",
        payload,
      });
      await sendPaymentNotifications(result, paymentPayload.paymentMethod);
      return { status: 200, body: "OK" };
    }

    await recordFailedPayment({ client, ...paymentPayload });
    await client.query("COMMIT");
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId,
      orderId,
      signatureValid: true,
      status: "processed",
      payload,
    });
    return { status: 200, body: "OK" };
  } catch (error) {
    await client.query("ROLLBACK");
    await insertWebhookEvent({
      event,
      eventKey,
      razorpayPaymentId,
      orderId,
      signatureValid: true,
      status: "failed",
      errorMessage: error.message,
      payload,
    });
    throw error;
  } finally {
    client.release();
  }
};
