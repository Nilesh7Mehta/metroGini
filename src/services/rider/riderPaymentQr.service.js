import razorpay from "../../config/razorpay.js";
import { PAYMENT_TYPE } from "../../utils/status.js";

// SDK types require close_by at least 15 minutes ahead; the create API also
// caps single-use QR expiry at about 2 hours. 16 minutes stays inside that
// window and leaves a small buffer for clock skew.
const QR_CLOSE_BY_SECONDS = 16 * 60;

const razorpayErrorMessage = (err) => {
  const description = err?.error?.description;
  const text = typeof description === "string" ? description.trim() : "";
  // Razorpay returns this when the QR Codes product is not activated on the account.
  if (/requested URL was not found/i.test(text)) {
    return "Razorpay QR Codes are not enabled on this account. Ask Razorpay to activate QR Codes, then retry.";
  }
  if (text) return text;
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  return "Failed to create payment QR";
};

/**
 * Single-use fixed-amount UPI QR for the remaining doorstep payment.
 * razorpay ^2.9.6: razorpay.qrCode.create -> POST /v1/payments/qr_codes.
 * QR notes are copied onto payment.entity.notes (payment.captured), so the
 * existing webhook can fulfill via internal_order_id without Checkout.
 */
export const createRemainingPaymentQr = async ({ orderId, amountRupees }) => {
  const amountPaise = Math.round(Number(amountRupees) * 100);
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw { status: 400, message: "No remaining amount to collect" };
  }

  const closeBy = Math.floor(Date.now() / 1000) + QR_CLOSE_BY_SECONDS;

  let qr;
  try {
    qr = await razorpay.qrCode.create({
      type: "upi_qr",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: amountPaise,
      name: "MetroGini order payment",
      description: `MetroGini order ${orderId} remaining payment`,
      close_by: closeBy,
      notes: {
        internal_order_id: String(orderId),
        payment_type: PAYMENT_TYPE.REMAINING,
      },
    });
  } catch (err) {
    console.error(
      "[rider-payment-qr] create failed:",
      err?.error?.description || err?.message || err,
    );
    throw { status: 502, message: razorpayErrorMessage(err) };
  }

  if (!qr?.id || !qr?.image_url) {
    throw { status: 502, message: "Failed to create payment QR" };
  }

  const resolvedCloseBy = Number(qr.close_by ?? closeBy);

  return {
    qr_id: qr.id,
    image_url: qr.image_url,
    image_content: qr.image_content || null,
    status: qr.status || "active",
    close_by: Number.isFinite(resolvedCloseBy) ? resolvedCloseBy : closeBy,
    amount: Number(qr.payment_amount ?? amountPaise),
    currency: "INR",
    payment_type: PAYMENT_TYPE.REMAINING,
  };
};
