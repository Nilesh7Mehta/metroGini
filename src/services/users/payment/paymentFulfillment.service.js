import { reserveSlotCapacity } from "../../common/slotAvailability.service.js";
import { PAYMENT_STATUS, PAYMENT_TYPE } from "../../../utils/status.js";
import { resolveVendorAndRider } from "./paymentAssignment.service.js";
import { ADVANCE_AMOUNT, formatDate, throwHttpError } from "./razorpay.util.js";

export const isPaymentAlreadyProcessed = async (client, razorpayPaymentId) => {
  const { rows } = await client.query(
    `SELECT id FROM payments WHERE transaction_id = $1 LIMIT 1`,
    [razorpayPaymentId],
  );
  return rows.length > 0;
};

const insertPayment = async (client, { orderId, amount, paymentType, paymentMethod, transactionId, status }) => {
  const paidAt = status === "success" ? ", paid_at" : "";
  const paidAtValue = status === "success" ? ", NOW()" : "";

  await client.query(
    `INSERT INTO payments
       (order_id, amount, payment_type, payment_method, transaction_id, status${paidAt})
     VALUES ($1, $2, $3, $4, $5, $6${paidAtValue})`,
    [orderId, amount, paymentType, paymentMethod || "razorpay", transactionId, status],
  );
};

export const fulfillAdvancePayment = async ({
  client,
  orderId,
  razorpayPaymentId,
  amount,
  paymentMethod = "razorpay",
  assignmentMeta,
  requireDraft = true,
}) => {
  const { rows } = await client.query(
    `SELECT id, user_id, pickup_date, address_id, status, payment_status,
            estimated_total, amount_paid, remaining_amount
     FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );

  if (rows.length === 0) throwHttpError("Order not found", 404);

  const order = rows[0];

  if (requireDraft && order.status !== "draft") {
    throwHttpError(`Order is not in a payable state for advance (status: ${order.status})`);
  }

  if ([PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.PAID].includes(order.payment_status)) {
    return { alreadyProcessed: true, order_id: order.id, user_id: order.user_id };
  }

  if (!order.pickup_date) throwHttpError("Pickup date is required before payment");

  const { vendor_id, rider_id, shift_id } = await resolveVendorAndRider(client, {
    ...assignmentMeta,
    address_id: order.address_id,
  });

  await reserveSlotCapacity(client, {
    laundryId: vendor_id,
    slotDate: formatDate(order.pickup_date),
    shiftId: shift_id,
  });

  const paidAmount = amount > 0 ? amount : ADVANCE_AMOUNT;

  // const remainingBaseline = Number(order.estimated_total ?? 0);

  await client.query(
    `UPDATE orders
     SET payment_status = $2, vendor_id = $3, assigned_rider_id = $4,
         status = 'booked',
         amount_paid = COALESCE(amount_paid, 0) + $5,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId, PAYMENT_STATUS.PARTIALLY_PAID, vendor_id, rider_id, paidAmount],
    // [orderId, PAYMENT_STATUS.PARTIALLY_PAID, vendor_id, rider_id, paidAmount,remainingBaseline],
  );
// remaining_amount = COALESCE(remaining_amount, $6) - $5,

  await insertPayment(client, {
    orderId,
    amount: paidAmount,
    paymentType: PAYMENT_TYPE.ADVANCE,
    paymentMethod,
    transactionId: razorpayPaymentId,
    status: "success",
  });

  return {
    alreadyProcessed: false,
    payment_type: PAYMENT_TYPE.ADVANCE,
    order_id: Number(orderId),
    user_id: order.user_id,
    vendor_id,
    rider_id,
    paidAmount,
  };
};

export const fulfillRemainingPayment = async ({
  client,
  orderId,
  razorpayPaymentId,
  amount,
  paymentMethod = "razorpay",
}) => {
  const { rows } = await client.query(
    `SELECT id, user_id, final_total, payment_status, amount_paid, remaining_amount
     FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );

  if (rows.length === 0) throwHttpError("Order not found", 404);

  const order = rows[0];

  if (order.payment_status === PAYMENT_STATUS.PAID) {
    return { alreadyProcessed: true, order_id: order.id, user_id: order.user_id };
  }

  if (order.payment_status !== PAYMENT_STATUS.PARTIALLY_PAID) {
    throwHttpError("Remaining payment requires order to be partially_paid");
  }

  if (order.final_total == null) {
    throwHttpError("Laundry have not calculated the final amount");
  }

  const existing = await client.query(
    `SELECT id FROM payments
     WHERE order_id = $1 AND payment_type = $2 AND status = 'success' LIMIT 1`,
    [orderId, PAYMENT_TYPE.REMAINING],
  );

  if (existing.rows.length > 0) {
    return { alreadyProcessed: true, order_id: order.id, user_id: order.user_id };
  }

  const finalTotal = Number(order.final_total);
  const paidAmount = amount > 0 ? amount : finalTotal;

  await insertPayment(client, {
    orderId,
    amount: paidAmount,
    paymentType: PAYMENT_TYPE.REMAINING,
    paymentMethod,
    transactionId: razorpayPaymentId,
    status: "success",
  });

  await client.query(
    `UPDATE orders
     SET payment_status = $2, payment_completed_at = NOW(),
         amount_paid = COALESCE(amount_paid, 0) + $3,
         remaining_amount = COALESCE(remaining_amount, $4) - $3,
         updated_at = NOW()
     WHERE id = $1`,
    [orderId, PAYMENT_STATUS.PAID, paidAmount, finalTotal],
  );

  return {
    alreadyProcessed: false,
    payment_type: PAYMENT_TYPE.REMAINING,
    order_id: Number(orderId),
    user_id: order.user_id,
    paidAmount,
  };
};

export const fulfillCapturedPayment = async ({ client, orderId, paymentType, ...rest }) => {
  if (!paymentType) throwHttpError("payment_type missing or invalid in payment notes");

  if (paymentType === PAYMENT_TYPE.REMAINING) {
    return fulfillRemainingPayment({ client, orderId, ...rest });
  }

  return fulfillAdvancePayment({ client, orderId, ...rest });
};

export const recordFailedPayment = async ({
  client,
  orderId,
  razorpayPaymentId,
  amount,
  paymentMethod,
  paymentType,
}) => {
  const { rows } = await client.query(
    `SELECT id, user_id, status, payment_status FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );

  if (rows.length === 0) return { handled: false };

  const order = rows[0];
  const type = paymentType || PAYMENT_TYPE.ADVANCE;

  if (type === PAYMENT_TYPE.REMAINING) {
    if (order.payment_status === PAYMENT_STATUS.PAID) {
      return { handled: true, skipped: true };
    }

    await insertPayment(client, {
      orderId,
      amount: amount > 0 ? amount : 0,
      paymentType: PAYMENT_TYPE.REMAINING,
      paymentMethod,
      transactionId: razorpayPaymentId,
      status: "failed",
    });

    return { handled: true, order_id: order.id, user_id: order.user_id };
  }

  if ([PAYMENT_STATUS.PARTIALLY_PAID, PAYMENT_STATUS.PAID].includes(order.payment_status)) {
    return { handled: true, skipped: true };
  }

  await insertPayment(client, {
    orderId,
    amount: amount > 0 ? amount : ADVANCE_AMOUNT,
    paymentType: PAYMENT_TYPE.ADVANCE,
    paymentMethod,
    transactionId: razorpayPaymentId,
    status: "failed",
  });

  if (order.status === "draft" && order.payment_status !== PAYMENT_STATUS.FAILED) {
    await client.query(
      `UPDATE orders SET payment_status = $2, updated_at = NOW() WHERE id = $1`,
      [orderId, PAYMENT_STATUS.FAILED],
    );
  }

  return { handled: true, order_id: order.id, user_id: order.user_id };
};
