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
 *   buttonValues?: Array<{
 *     index: number,
 *     sub_type: string,
 *     parameters: Record<string, string>,
 *   }> | Record<string, string | string[]>,
 * }} opts
 */
export const sendGallaboxTemplate = async ({
  phone,
  name,
  templateName,
  bodyValues = {},
  buttonValues,
}) => {
  const template = String(templateName || "").trim();

  if (!isGallaboxWhatsappEnabled()) {
    console.warn(
      `[gallabox] SKIP template=${template || "(none)"} reason=disabled_or_missing_credentials enabled=${process.env.GALLABOX_WHATSAPP_ENABLED} hasKey=${Boolean(process.env.GALLABOX_API_KEY?.trim())} hasSecret=${Boolean(process.env.GALLABOX_API_SECRET?.trim())} hasChannel=${Boolean(process.env.GALLABOX_CHANNEL_ID?.trim())}`,
    );
    return { skipped: true, reason: "disabled_or_missing_credentials" };
  }

  const recipientPhone = normalizeMobile(phone);
  if (!recipientPhone) {
    console.warn(
      `[gallabox] SKIP template=${template || "(none)"} reason=invalid_phone rawPhone=${JSON.stringify(phone)}`,
    );
    return { skipped: true, reason: "invalid_phone" };
  }

  if (!template) {
    console.warn(`[gallabox] SKIP reason=missing_template`);
    return { skipped: true, reason: "missing_template" };
  }

  const templatePayload = {
    templateName: template,
    bodyValues: Object.fromEntries(
      Object.entries(bodyValues).map(([k, v]) => [String(k), String(v ?? "")]),
    ),
  };

  const normalizedButtons = normalizeButtonValues(buttonValues);
  if (normalizedButtons.length > 0) {
    templatePayload.buttonValues = normalizedButtons;
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

  console.log(
    `[gallabox] SENDING template=${template} to=${recipientPhone} bodyValues=${JSON.stringify(templatePayload.bodyValues)} buttonValues=${JSON.stringify(templatePayload.buttonValues || [])}`,
  );

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

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      console.error(
        `[gallabox] FAILED template=${template} to=${recipientPhone} status=${res.status} body=${text.slice(0, 500)}`,
      );
      return { skipped: false, ok: false, status: res.status, template };
    }

    console.log(
      `[gallabox] OK template=${template} to=${recipientPhone} status=${res.status} body=${text.slice(0, 300)}`,
    );
    return { skipped: false, ok: true, template };
  } catch (err) {
    console.error(
      `[gallabox] ERROR template=${template} to=${recipientPhone}:`,
      err.message,
    );
    return { skipped: false, ok: false, error: err.message, template };
  }
};

/** Gallabox expects buttonValues as an array (uses .find internally). */
const normalizeButtonValues = (buttonValues) => {
  if (!buttonValues) return [];

  if (Array.isArray(buttonValues)) {
    return buttonValues.map((btn, i) => ({
      index: Number(btn?.index ?? i),
      sub_type: String(btn?.sub_type || "url"),
      parameters: {
        type: String(btn?.parameters?.type || "text"),
        text: String(
          btn?.parameters?.text ??
            btn?.parameters?.payload ??
            btn?.text ??
            "",
        ),
      },
    }));
  }

  // Legacy object map: { "0": "74" } → URL button array
  return Object.entries(buttonValues).map(([k, v]) => ({
    index: Number(k) || 0,
    sub_type: "url",
    parameters: {
      type: "text",
      text: Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""),
    },
  }));
};

/** Dynamic Pay Now URL suffix for /api/pay/{orderId} */
const payNowButtonValues = (orderId) => [
  {
    index: 0,
    sub_type: "url",
    parameters: {
      type: "text",
      text: String(orderId),
    },
  },
];

/** Fire-and-forget — never throws to callers */
export const sendGallaboxTemplateSafe = (opts) => {
  setImmediate(() => {
    sendGallaboxTemplate(opts)
      .then((result) => {
        if (result?.skipped) {
          console.warn(
            `[gallabox] async result SKIP template=${opts?.templateName} reason=${result.reason}`,
          );
        }
      })
      .catch((err) => {
        console.error(`[gallabox] async unhandled:`, err?.message || err);
      });
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
  console.log(
    `[gallabox] order_bill_payment trigger orderId=${orderId} mobile=${JSON.stringify(mobile)} remaining=${amountPayable} parsedRemaining=${remaining} weight=${weightKg} total=${totalBill} coupon=${couponCode}`,
  );
  if (!Number.isFinite(remaining) || remaining <= 0) {
    console.warn(
      `[gallabox] SKIP order_bill_payment orderId=${orderId} reason=remaining_amount_not_positive remaining=${amountPayable}`,
    );
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
    buttonValues: payNowButtonValues(orderId),
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
    buttonValues: payNowButtonValues(orderId),
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

/** Template: order_pickup_update — {{1}} pickup OTP */
export const sendOrderPickupUpdateSafe = ({ mobile, name, otp }) => {
  const code = String(otp || "").trim();
  if (!code) return;

  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "order_pickup_update",
    bodyValues: {
      "1": code,
    },
  });
};

export const ORDER_PICKUP_UPDATE_TITLE = "Order Pickup Update";

/**
 * Send order_pickup_update once per order (deduped by notification title).
 * Used by pickup morning cron; startPickup is fallback if this was missed.
 */
export const notifyPickupUpdateForOrders = async (orderIds) => {
  const { default: sql } = await import("../../config/db.js");
  const { createNotificationsBatch } = await import(
    "../../utils/notificationHelper.js"
  );

  const ids = [
    ...new Set(orderIds.map((id) => Number(id)).filter((n) => n > 0)),
  ];
  if (ids.length === 0) return;

  const { rows } = await sql.query(
    `SELECT o.id, o.user_id, o.pickup_otp, u.full_name, u.mobile
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = ANY($1::int[])
       AND o.pickup_otp IS NOT NULL
       AND TRIM(o.pickup_otp::text) <> ''
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.identity_id = o.user_id
           AND n.role = 'user'
           AND n.reference_type = 'order'
           AND n.reference_id = o.id
           AND n.title = $2
       )`,
    [ids, ORDER_PICKUP_UPDATE_TITLE],
  );

  for (const order of rows) {
    await createNotificationsBatch([
      {
        identity_id: order.user_id,
        role: "user",
        title: ORDER_PICKUP_UPDATE_TITLE,
        message: `Your rider has been assigned. Share OTP ${order.pickup_otp} at pickup.`,
        reference_type: "order",
        reference_id: order.id,
      },
    ]);

    sendOrderPickupUpdateSafe({
      mobile: order.mobile,
      name: order.full_name,
      otp: order.pickup_otp,
    });
  }
};

/**
 * Template: order_on_the_way
 * {{1}} ORD-xxx, {{2}} delivery OTP
 */
export const sendOrderOnTheWaySafe = ({ mobile, name, orderId, otp }) => {
  const code = String(otp || "").trim();
  if (!code) return;

  sendGallaboxTemplateSafe({
    phone: mobile,
    name,
    templateName: "order_on_the_way",
    bodyValues: {
      "1": formatOrderDisplayId(orderId),
      "2": code,
    },
  });
};
