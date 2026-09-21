/**
 * Public WhatsApp Pay Now link: GET /api/pay/:token
 * Token is an opaque unguessable pay_token (not the numeric order id).
 * Creates (or reuses) a Razorpay Payment Link for remaining balance and redirects.
 */
import crypto from "crypto";
import sql from "../../../config/db.js";
import razorpay from "../../../config/razorpay.js";
import { PAYMENT_STATUS, PAYMENT_TYPE } from "../../../utils/status.js";
import { formatOrderDisplayId } from "../../../utils/userNotificationTemplates.js";
import { normalizeMobile } from "../../common/sms.service.js";
import { throwHttpError } from "./razorpay.util.js";

const PAY_TOKEN_RE = /^[a-f0-9]{32}$/i;

const htmlPage = (title, message) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — MetroGini</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f6f7f9; color: #111;
      display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
    .card { background: #fff; padding: 28px 24px; border-radius: 12px; max-width: 420px;
      box-shadow: 0 8px 24px rgba(0,0,0,.08); text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 10px; }
    p { margin: 0; line-height: 1.5; color: #444; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

const formatRupees = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const contactFromMobile = (mobile) => {
  const normalized = normalizeMobile(mobile);
  if (!normalized) return undefined;
  if (normalized.startsWith("91") && normalized.length === 12) {
    return normalized.slice(2);
  }
  return normalized;
};

const isReusableLinkStatus = (status) => {
  const s = String(status || "").toLowerCase();
  return s === "created" || s === "active" || s === "";
};

const newPayToken = () => crypto.randomBytes(16).toString("hex");

/**
 * Ensure order has an opaque pay_token for WhatsApp / public pay URLs.
 * @returns {Promise<string>}
 */
export const ensureOrderPayToken = async (orderId) => {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    throwHttpError("Invalid order id", 400);
  }

  const existing = await sql.query(
    `SELECT pay_token FROM orders WHERE id = $1`,
    [id],
  );
  if (!existing.rows[0]) throwHttpError("Order not found", 404);

  const current = String(existing.rows[0].pay_token || "").trim();
  if (PAY_TOKEN_RE.test(current)) return current.toLowerCase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = newPayToken();
    try {
      const { rows } = await sql.query(
        `UPDATE orders
         SET pay_token = $1, updated_at = NOW()
         WHERE id = $2
           AND (pay_token IS NULL OR TRIM(pay_token) = '')
         RETURNING pay_token`,
        [token, id],
      );
      if (rows[0]?.pay_token) return String(rows[0].pay_token).toLowerCase();

      const again = await sql.query(
        `SELECT pay_token FROM orders WHERE id = $1`,
        [id],
      );
      const raced = String(again.rows[0]?.pay_token || "").trim();
      if (PAY_TOKEN_RE.test(raced)) return raced.toLowerCase();
    } catch (err) {
      if (err.code !== "23505") throw err;
    }
  }

  throwHttpError("Unable to create payment link token", 500);
};

/**
 * Resolve a live Razorpay short_url from opaque pay_token.
 * @returns {{ shortUrl: string } | { alreadyPaid: true } }
 */
export const resolveOrderPaymentLinkByToken = async (rawToken) => {
  const token = String(rawToken || "").trim().toLowerCase();

  // Reject guessable numeric order ids (old /api/pay/123 links)
  if (!PAY_TOKEN_RE.test(token)) {
    throwHttpError("Invalid or expired payment link", 404);
  }

  const { rows } = await sql.query(
    `SELECT o.id, o.payment_status, o.final_total, o.remaining_amount,
            o.razorpay_payment_link_id, o.razorpay_payment_link_url,
            o.order_code, u.full_name, u.mobile, u.email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.pay_token = $1`,
    [token],
  );

  if (!rows[0]) throwHttpError("Invalid or expired payment link", 404);

  const order = rows[0];
  const id = Number(order.id);
  const remaining = Math.max(0, Number(order.remaining_amount) || 0);
  const displayId = formatOrderDisplayId(order.id);

  if (
    order.payment_status === PAYMENT_STATUS.PAID ||
    remaining <= 0
  ) {
    return { alreadyPaid: true, displayId };
  }

  if (order.final_total == null) {
    throwHttpError("Final bill is not ready for this order yet", 400);
  }

  if (order.payment_status !== PAYMENT_STATUS.PARTIALLY_PAID) {
    throwHttpError("This order is not ready for remaining payment", 400);
  }

  if (order.razorpay_payment_link_id) {
    try {
      const existing = await razorpay.paymentLink.fetch(
        order.razorpay_payment_link_id,
      );
      const existingAmount = Number(existing.amount || 0) / 100;
      const amountMatches =
        Math.round(existingAmount * 100) === Math.round(remaining * 100);

      if (String(existing.status).toLowerCase() === "paid") {
        return { alreadyPaid: true, displayId };
      }

      if (isReusableLinkStatus(existing.status) && amountMatches && existing.short_url) {
        if (existing.short_url !== order.razorpay_payment_link_url) {
          await sql.query(
            `UPDATE orders
             SET razorpay_payment_link_url = $1, updated_at = NOW()
             WHERE id = $2`,
            [existing.short_url, id],
          );
        }
        return { shortUrl: existing.short_url, displayId };
      }

      if (isReusableLinkStatus(existing.status)) {
        try {
          await razorpay.paymentLink.cancel(order.razorpay_payment_link_id);
        } catch (_) {
          /* ignore cancel failures; create a fresh link */
        }
      }
    } catch (err) {
      console.error(
        `[pay-redirect] fetch link ${order.razorpay_payment_link_id}:`,
        err.message,
      );
    }
  }

  const amountPaise = Math.round(remaining * 100);
  if (amountPaise <= 0) {
    return { alreadyPaid: true, displayId };
  }

  const customer = {
    name: String(order.full_name || "MetroGini Customer").trim(),
  };
  const contact = contactFromMobile(order.mobile);
  if (contact) customer.contact = contact;
  if (order.email?.trim()) customer.email = order.email.trim();

  const link = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency: "INR",
    accept_partial: false,
    description: `MetroGini ${displayId} — remaining payment ₹${formatRupees(remaining)}`,
    customer,
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: {
      internal_order_id: String(id),
      payment_type: PAYMENT_TYPE.REMAINING,
    },
    reference_id: `mg_${id}_r_${Date.now()}`.slice(0, 40),
  });

  if (!link?.short_url) {
    throwHttpError("Failed to create payment link", 502);
  }

  await sql.query(
    `UPDATE orders
     SET razorpay_payment_link_id = $1,
         razorpay_payment_link_url = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [link.id, link.short_url, id],
  );

  return { shortUrl: link.short_url, displayId };
};

export const handlePayRedirect = async (token) => {
  const result = await resolveOrderPaymentLinkByToken(token);

  if (result.alreadyPaid) {
    return {
      type: "html",
      status: 200,
      body: htmlPage(
        "Payment complete",
        `Payment for ${result.displayId || "this order"} is already complete. Thank you for choosing MetroGini!`,
      ),
    };
  }

  return {
    type: "redirect",
    status: 302,
    location: result.shortUrl,
  };
};

export const payRedirectErrorPage = (status, message) => ({
  type: "html",
  status,
  body: htmlPage(status === 404 ? "Link not found" : "Unable to pay", message),
});
