import crypto from "crypto";
import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import { sendUserEmailSafe, sendAdvancePaymentEmail } from "../../../services/common/email.service.js";
import { reserveSlotCapacity } from "../../../services/common/slotAvailability.service.js";
import razorpay from "../../../config/razorpay.js";
import * as checkoutService from "../../../services/users/payment/razorpayCheckout.service.js";
import { handleRazorpayWebhook } from "../../../services/users/payment/razorpayWebhook.service.js";
import { verifyPaymentSignature } from "../../../services/users/payment/razorpay.util.js";

const handleServiceError = (error, res, next) => {
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }
  return next(error);
};

export const dummyPay = async (req, res, next) => {
  try {
    const data = await checkoutService.processDummyPay({
      orderId: req.params.id,
      userId: req.user.id,
      body: req.body,
    });

    const advanceAmount = 500;

    // 6️⃣ Record advance payment + assign vendor
    await client.query(
      `UPDATE orders
       SET payment_status = 'partially_paid',
           vendor_id = $2,
           assigned_rider_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [order_id, vendor_id, rider_id]
    );

    // update status to confirmed
    await client.query(
      `UPDATE orders
       SET status = 'booked'
       WHERE id = $1`,
      [order_id]
    );

    // 7️⃣ Insert payment
    await client.query(
      `INSERT INTO payments
       (order_id, amount, payment_type, payment_method, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, advanceAmount, "advance", "UPI", "success"]
    );

    // 8️⃣ Commit
    await client.query("COMMIT");


    // Notify user — order confirmed
    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Order Confirmed',
      message: `Your order #${order_id} has been confirmed and advance payment of ₹${advanceAmount} received. A rider has been assigned for pickup.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    // Notify vendor — new order assigned
    await createNotificationsBatch([{
      identity_id: vendor_id,
      role: 'vendor',
      title: 'New Order Assigned',
      message: `Order #${order_id} has been assigned to your laundry. A rider will deliver it to you on the pickup date.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    const orderMeta = await sql.query(
      `SELECT order_code FROM orders WHERE id = $1`,
      [order_id],
    );

    sendUserEmailSafe(user_id, sendAdvancePaymentEmail, {
      orderId: order_id,
      orderCode: orderMeta.rows[0]?.order_code,
      amount: advanceAmount,
    });

    return res.status(200).json({
      message: "Payment successful. Order booked.",
      order_id,
      assigned_vendor: vendor_id,
      assigned_rider: rider_id,
      user_pincode: pincode,
      advance_paid: advanceAmount,
    });

    return res.status(200).json(data);
  } catch (error) {
    return handleServiceError(error, res, next);
  }
};

export const createOrderRazorPay = async (req, res, next) => {
  try {
    const data = await checkoutService.createRazorpayOrder({
      orderId: req.params.id,
      userId: req.user.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (error) {
    return handleServiceError(error, res, next);
  }
};

export const verifyOrderRazorPay = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
        verified: false,
      });
    }

    const verified = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!verified) {
      return res.status(400).json({ message: "Invalid payment signature", verified: false });
    }

    return res.status(200).json({ message: "Payment verified successfully", verified: true });
  } catch (error) {
    next(error);
  }
};

export const razorpayWebhook = async (req, res, next) => {
  try {
    const result = await handleRazorpayWebhook(
      req.body,
      req.headers["x-razorpay-signature"],
    );

    if (typeof result.body === "string") {
      return res.status(result.status).send(result.body);
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};
