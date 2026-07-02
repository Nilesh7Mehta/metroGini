import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
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

const sendPaymentNotifications = async (result) => {
  if (result.alreadyProcessed) return;

  if (result.payment_type === PAYMENT_TYPE.ADVANCE) {
    await createNotificationsBatch([
      {
        identity_id: result.user_id,
        role: "user",
        title: "Order Confirmed",
        message: `Your order #${result.order_id} has been confirmed and advance payment of ₹${result.paidAmount} received. A rider has been assigned for pickup.`,
        reference_type: "order",
        reference_id: result.order_id,
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
    return;
  }

  await createNotificationsBatch([
    {
      identity_id: result.user_id,
      role: "user",
      title: "Payment Complete",
      message: `Remaining payment of ₹${result.paidAmount} received for order #${result.order_id}. Thank you!`,
      reference_type: "order",
      reference_id: result.order_id,
    },
  ]);
};

export const handleRazorpayWebhook = async (body, signature) => {
  const { rawBody, payload } = parseWebhookBody(body);

  if (!verifyWebhookSignature(rawBody, signature)) {
    return { status: 400, body: { success: false, message: "Invalid webhook signature" } };
  }

  const event = payload?.event;
  if (!RELEVANT_WEBHOOK_EVENTS.has(event)) {
    return { status: 200, body: "OK" };
  }

  const paymentEntity = payload?.payload?.payment?.entity;
  const orderEntity = payload?.payload?.order?.entity;

  if (!paymentEntity?.id) {
    return { status: 200, body: "OK" };
  }

  const orderId = extractInternalOrderId(paymentEntity, orderEntity);
  if (!orderId) {
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
      return { status: 200, body: "OK" };
    }

    if (event === "payment.captured") {
      const result = await fulfillCapturedPayment({ client, ...paymentPayload });
      await client.query("COMMIT");
      await sendPaymentNotifications(result);
      return { status: 200, body: "OK" };
    }

    await recordFailedPayment({ client, ...paymentPayload });
    await client.query("COMMIT");
    return { status: 200, body: "OK" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
