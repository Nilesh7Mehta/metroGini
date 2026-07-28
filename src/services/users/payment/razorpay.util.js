import crypto from "crypto";
import { PAYMENT_TYPE } from "../../../utils/status.js";

export const ADVANCE_AMOUNT = 0;// change to 500 for advance payment
export const RELEVANT_WEBHOOK_EVENTS = new Set(["payment.captured", "payment.failed"]);

const VALID_PAYMENT_TYPES = new Set([PAYMENT_TYPE.ADVANCE, PAYMENT_TYPE.REMAINING]);

export const throwHttpError = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export const formatDate = (date) => {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toLocaleDateString("en-CA");
};

export const validatePaymentType = (payment_type) => {
  const normalized = String(payment_type || "").toLowerCase();
  if (!VALID_PAYMENT_TYPES.has(normalized)) {
    throwHttpError("payment_type must be 'advance' or 'remaining'");
  }
  return normalized;
};

export const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throwHttpError("Webhook secret is not configured", 500);
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
};

export const verifyPaymentSignature = (razorpay_order_id, razorpay_payment_id, razorpay_signature) => {
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(razorpay_signature, "hex");

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
};

export const parseWebhookBody = (body) => {
  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const payload = Buffer.isBuffer(body) ? JSON.parse(body.toString("utf8")) : body;
  return { rawBody, payload };
};

export const extractInternalOrderId = (paymentEntity, orderEntity) => {
  const fromNotes =
    paymentEntity?.notes?.internal_order_id ?? orderEntity?.notes?.internal_order_id;

  if (fromNotes) return String(fromNotes);

  const receipt = orderEntity?.receipt;
  const match = String(receipt || "").match(/^order_(\d+)(?:_(?:advance|remaining))?$/i);
  return match ? match[1] : null;
};

export const extractPaymentNotes = (paymentEntity, orderEntity) => {
  const notes = {
    ...(orderEntity?.notes || {}),
    ...(paymentEntity?.notes || {}),
  };

  const payment_type = String(notes.payment_type || PAYMENT_TYPE.ADVANCE).toLowerCase();

  return {
    payment_type: VALID_PAYMENT_TYPES.has(payment_type) ? payment_type : null,
    group_code: notes.group_code ? String(notes.group_code).trim() : null,
    shift_id: notes.shift_id ?? null,
    day_of_week: notes.day_of_week ?? notes.days ?? null,
  };
};

export const parseSlotAssignment = (body) => {
  const { group_code, shift_id, days, day_of_week } = body;
  const resolvedDay = day_of_week ?? days;

  if (!group_code?.trim()) throwHttpError("group_code is required");

  const shiftId = Number(shift_id);
  const dayOfWeek = Number(resolvedDay);

  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    throwHttpError("shift_id must be a positive integer");
  }

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    throwHttpError("day_of_week must be between 1 (Monday) and 7 (Sunday)");
  }

  return { group_code: group_code.trim(), shift_id: shiftId, day_of_week: dayOfWeek };
};
