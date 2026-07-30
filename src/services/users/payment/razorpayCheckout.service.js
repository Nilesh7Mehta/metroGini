import sql from "../../../config/db.js";
import razorpay from "../../../config/razorpay.js";
import {
  sendAdvancePaymentEmail,
  sendUserEmailSafe,
} from "../../common/email.service.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import {
  fetchOrderNotifyContext,
  orderConfirmedTemplate,
} from "../../../utils/userNotificationTemplates.js";
import { PAYMENT_STATUS, PAYMENT_TYPE } from "../../../utils/status.js";
import { fulfillAdvancePayment } from "./paymentFulfillment.service.js";
import {
  ADVANCE_AMOUNT,
  parseSlotAssignment,
  throwHttpError,
  validatePaymentType,
} from "./razorpay.util.js";

export const createRazorpayOrder = async ({ orderId, userId, body }) => {
  const amount = Number(body?.amount ?? ADVANCE_AMOUNT);
  const payment_type = validatePaymentType(body?.payment_type);

  if (!Number.isFinite(amount) || amount <= 0) {
    throwHttpError("amount must be a positive number");
  }

  const { rows } = await sql.query(
    `SELECT id, status, payment_status FROM orders WHERE id = $1 AND user_id = $2`,
    [orderId, userId],
  );

  if (rows.length === 0) throwHttpError("Order not found", 404);

  const order = rows[0];
  const notes = { internal_order_id: String(orderId), payment_type };

  if (payment_type === PAYMENT_TYPE.ADVANCE) {
    const slot = parseSlotAssignment(body);

    if (order.status !== "draft") {
      throwHttpError("Advance payment requires order in draft status");
    }

    if ([PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.PAID].includes(order.payment_status)) {
      throwHttpError("Advance payment already completed");
    }

    Object.assign(notes, {
      group_code: slot.group_code,
      shift_id: String(slot.shift_id),
      day_of_week: String(slot.day_of_week),
    });
  } else {
    if (order.payment_status !== PAYMENT_STATUS.PARTIALLY_PAID) {
      throwHttpError("Remaining payment requires order to be partially_paid");
    }

    const remaining = await sql.query(
      `SELECT id FROM payments
       WHERE order_id = $1 AND payment_type = $2 AND status = 'success' LIMIT 1`,
      [orderId, PAYMENT_TYPE.REMAINING],
    );

    if (remaining.rows.length > 0) {
      throwHttpError("Remaining payment already completed");
    }
  }

  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt: `order_${orderId}_${payment_type}`,
    notes,
  });

  return {
    key_id: process.env.RAZORPAY_KEY_ID,
    order_id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    payment_type,
  };
};

export const processDummyPay = async ({ orderId, userId, body }) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const orderCheck = await client.query(
      `SELECT id, pickup_date, address_id
       FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [orderId, userId],
    );

    if (orderCheck.rows.length === 0) {
      throwHttpError("Order not found, not ready for payment, or already paid");
    }

    const { address_id, pickup_date } = orderCheck.rows[0];
    if (!pickup_date) throwHttpError("Pickup date is required before payment");

    const addressRes = await client.query(
      `SELECT pincode FROM user_address_details WHERE id = $1`,
      [address_id],
    );
    if (addressRes.rows.length === 0) throwHttpError("Address not found");

    const assignmentMeta = parseSlotAssignment(body);

    const result = await fulfillAdvancePayment({
      client,
      orderId,
      razorpayPaymentId: null,
      amount: 0,
      paymentMethod: "UPI",
      assignmentMeta,
      requireDraft: false,
    });

    await client.query("COMMIT");

    if (!result.alreadyProcessed) {
      const ctx = await fetchOrderNotifyContext(orderId);
      const confirmed = orderConfirmedTemplate({
        name: ctx?.name,
        orderCode: ctx?.orderCode,
        orderId,
        pickupDate: ctx?.pickupDate,
        pickupSlot: ctx?.pickupSlot,
      });

      await createNotificationsBatch([
        {
          identity_id: userId,
          role: "user",
          title: confirmed.title,
          message: confirmed.message,
          reference_type: "order",
          reference_id: orderId,
          data: confirmed.data,
        },
        {
          identity_id: result.vendor_id,
          role: "vendor",
          title: "New Order Assigned",
          message: `Order #${orderId} has been assigned to your laundry. A rider will deliver it to you on the pickup date.`,
          reference_type: "order",
          reference_id: orderId,
        },
      ]);

      const orderMeta = await sql.query(
        `SELECT order_code FROM orders WHERE id = $1`,
        [orderId],
      );

      sendUserEmailSafe(userId, sendAdvancePaymentEmail, {
        orderId,
        orderCode: orderMeta.rows[0]?.order_code,
        amount: result.paidAmount,
      });
    }

    return {
      message: "Payment successful. Order booked.",
      order_id: orderId,
      assigned_vendor: result.vendor_id,
      assigned_rider: result.rider_id,
      user_pincode: addressRes.rows[0].pincode,
      advance_paid: result.paidAmount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
