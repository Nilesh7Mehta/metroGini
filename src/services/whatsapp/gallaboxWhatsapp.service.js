/**
 * MetroGini → Gallabox WhatsApp template messages.
 * Gated by GALLABOX_WHATSAPP_ENABLED=true (+ API credentials).
 */
import {
  getGallaboxApiKey,
  getGallaboxApiSecret,
  getGallaboxChannelId,
  getGallaboxMessagesUrl,
  getGallaboxTimeoutMs,
  isGallaboxWhatsappEnabled,
} from "../../config/gallabox.js";
import { normalizeMobile } from "../common/sms.service.js";
import { formatOrderDisplayId } from "../../utils/userNotificationTemplates.js";

const displayName = (name) => {
  const n = String(name || "").trim();
  return n || "there";
};

/**
 * Send an approved WhatsApp template via Gallabox.
 * @param {{
 *   phone: string,
 *   name?: string,
 *   templateName: string,
 *   bodyValues?: Record<string, string>,
 *   buttonValues?: Record<string, string | string[]>,
 * }} opts
 */
export const sendGallaboxTemplate = async ({
  phone,
  name,
  templateName,
  bodyValues = {},
  buttonValues,
}) => {
  if (!isGallaboxWhatsappEnabled()) {
    return { skipped: true, reason: "disabled_or_missing_credentials" };
  }

  const recipientPhone = normalizeMobile(phone);
  if (!recipientPhone) {
    return { skipped: true, reason: "invalid_phone" };
  }

  const template = String(templateName || "").trim();
  if (!template) {
    return { skipped: true, reason: "missing_template" };
  }

  const templatePayload = {
    templateName: template,
    bodyValues: Object.fromEntries(
      Object.entries(bodyValues).map(([k, v]) => [String(k), String(v ?? "")]),
    ),
  };

  if (buttonValues && Object.keys(buttonValues).length > 0) {
    templatePayload.buttonValues = Object.fromEntries(
      Object.entries(buttonValues).map(([k, v]) => [
        String(k),
        Array.isArray(v) ? v.map((x) => String(x ?? "")) : String(v ?? ""),
      ]),
    );
  }

  const payload = {
    channelId: getGallaboxChannelId(),
    channelType: "whatsapp",
    recipient: {
      name: displayName(name),
      phone: recipientPhone,
    },
    whatsapp: {
      type: "template",
      template: templatePayload,
    },
  };

  try {
    const res = await fetch(getGallaboxMessagesUrl(), {
      method: "POST",
      headers: {
        apiKey: getGallaboxApiKey(),
        apiSecret: getGallaboxApiSecret(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getGallaboxTimeoutMs()),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[gallabox] ${template} failed status=${res.status} body=${text.slice(0, 300)}`,
      );
      return { skipped: false, ok: false, status: res.status, template };
    }

    return { skipped: false, ok: true, template };
  } catch (err) {
    console.error(`[gallabox] ${template} error:`, err.message);
    return { skipped: false, ok: false, error: err.message, template };
  }
};

/** Fire-and-forget — never throws to callers */
export const sendGallaboxTemplateSafe = (opts) => {
  setImmediate(() => {
    sendGallaboxTemplate(opts).catch(() => {});
  });
};

/** Template: pickup_day_reminder — {{1}} name, {{2}} ORD-xxx */
export const sendPickupDayReminderSafe = ({ mobile, name, orderId }) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "pickup_day_reminder",
    bodyValues: {
      "1": displayName(name),
      "2": formatOrderDisplayId(orderId),
    },
  });
};

/** Template: pickup_completed — no body variables */
export const sendPickupCompletedSafe = ({ mobile, name }) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "pickup_completed",
    bodyValues: {},
  });
};

/** Template: payment_received — {{1}} ORD-xxx */
export const sendPaymentReceivedSafe = ({ mobile, name, orderId }) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "payment_received",
    bodyValues: {
      "1": formatOrderDisplayId(orderId),
    },
  });
};

/** Template: order_delivered — {{1}} ORD-xxx */
export const sendOrderDeliveredSafe = ({ mobile, name, orderId }) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "order_delivered",
    bodyValues: {
      "1": formatOrderDisplayId(orderId),
    },
  });
};

const formatMoneyValue = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const formatWeightValue = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
};

/**
 * Template: order_bill_payment
 * {{1}} weight kg, {{2}} total bill, {{3}} coupon code, {{4}} amount payable
 * Pay Now button dynamic suffix = order.id → /api/pay/{id}
 */
export const sendOrderBillPaymentSafe = ({
  mobile,
  name,
  orderId,
  weightKg,
  totalBill,
  couponCode,
  amountPayable,
}) => {
  const remaining = Number(amountPayable);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return;
  }

  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "order_bill_payment",
    bodyValues: {
      "1": formatWeightValue(weightKg),
      "2": formatMoneyValue(totalBill),
      "3": String(couponCode || "").trim() || "NA",
      "4": formatMoneyValue(remaining),
    },
    // Dynamic CTA URL suffix for https://api.metrogini.com/api/pay/
    buttonValues: {
      "0": String(orderId),
    },
  });
};

/**
 * Template: payment_reminder
 * {{1}} ORD-xxx, {{2}} amount payable
 * Pay Now button dynamic suffix = order.id → /api/pay/{id}
 */
export const sendPaymentReminderSafe = ({
  mobile,
  name,
  orderId,
  amountPayable,
}) => {
  const remaining = Number(amountPayable);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return;
  }

  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "payment_reminder",
    bodyValues: {
      "1": formatOrderDisplayId(orderId),
      "2": formatMoneyValue(remaining),
    },
    buttonValues: {
      "0": String(orderId),
    },
  });
};

/** Template: customer_reengagement_offer — {{1}} name, {{2}} coupon (VALUED10) */
export const sendCustomerReengagementOfferSafe = ({
  mobile,
  name,
  couponCode = "VALUED10",
}) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "customer_reengagement_offer",
    bodyValues: {
      "1": displayName(name),
      "2": String(couponCode || "VALUED10").trim() || "VALUED10",
    },
  });
};

const formatWhatsappDate = (value) => {
  if (value == null || value === "") return "—";
  const raw = String(value).trim();
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [year, month, day] = ymd.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
};

/**
 * Template: booking_wash_by_kilo
 * {{1}} name, {{2}} order id, {{3}} pickup date, {{4}} delivery date
 */
export const sendBookingWashByKiloSafe = ({
  mobile,
  name,
  orderId,
  pickupDate,
  deliveryDate,
}) => {
  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "booking_wash_by_kilo",
    bodyValues: {
      "1": displayName(name),
      "2": formatOrderDisplayId(orderId),
      "3": formatWhatsappDate(pickupDate),
      "4": formatWhatsappDate(deliveryDate),
    },
  });
};
