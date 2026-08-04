
import fs from "fs";
import path from "path";
import sql from "../../config/db.js";
import { getEmailFrom, getEmailTransporter, isEmailEnabled } from "../../config/email.js";
import { ensureUserOrderInvoiceFile } from "../../utils/userOrderInvoice.util.js";

const LOGO_PATH = path.join(process.cwd(), "uploads", "logo.png");

/** Match PDF invoice money format: Rs.1,234.56 */
const formatInr = (value) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const fixed = safe.toFixed(2);
  const [intPart, dec] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs.${withCommas}.${dec}`;
};

const formatIssuedDate = (date = new Date()) =>
  date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const baseTemplate = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 560px; margin: 24px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1a56db; color: #fff; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .content { padding: 24px; }
    .otp-box { font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 16px 0; color: #1a56db; }
    .amount { font-size: 24px; font-weight: bold; color: #059669; }
    .footer { padding: 16px 24px; background: #f9fafb; font-size: 12px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Metro Gini</h1></div>
    <div class="content">
      <h2>${title}</h2>
      ${bodyHtml}
    </div>
    <div class="footer">
      This is an automated message from Metro Gini. Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;

/**
 * Uber-style receipt HTML matching the order invoice PDF layout.
 */
const buildInvoiceReceiptEmailHtml = ({
  name,
  orderRef,
  invoiceId,
  issued,
  isPaid,
  finalTotal,
  advancePaid,
  remainingPaid,
  subtotalBeforeGst,
  cgstAmount,
  sgstAmount,
  gstAmount,
  payWhen,
  weightInfo,
  clothesInfo,
  hasPdf,
  includeLogo,
}) => {
  const safeName = escapeHtml(name || "Customer");
  const safeOrderRef = escapeHtml(orderRef);
  const safeInvoiceId = escapeHtml(invoiceId);
  const greeting = `Thanks for choosing us, ${safeName}`;
  const subtitle = isPaid
    ? "Here is your laundry order receipt."
    : "Here is your laundry billing summary.";
  const total = formatInr(finalTotal);
  const advance = formatInr(advancePaid);
  const remaining = formatInr(remainingPaid);
  const payLabel = isPaid ? "Payment received" : "Payment pending";
  const paySub = isPaid
    ? escapeHtml(payWhen)
    : "No payment recorded yet";
  const payIcon = isPaid ? "P" : "!";
  const payIconBg = isPaid ? "#0F9D58" : "#6A6A6A";
  const amountRowLabel = isPaid ? "Final amount paid" : "Amount due";
  const weight = weightInfo || "-";
  const clothes = clothesInfo || "-";

  const gstRows =
    subtotalBeforeGst != null && gstAmount != null
      ? `
        <tr>
          <td style="padding:10px 0;font-size:14px;color:#000000;">Taxable value</td>
          <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${formatInr(subtotalBeforeGst)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:14px;color:#000000;">CGST (9%)</td>
          <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${formatInr(cgstAmount)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:14px;color:#000000;">SGST (9%)</td>
          <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${formatInr(sgstAmount)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:14px;color:#000000;">GST total (18%)</td>
          <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${formatInr(gstAmount)}</td>
        </tr>`
      : "";

  const logoCell = includeLogo
    ? `<td width="90" valign="top" style="text-align:right;">
         <img src="cid:metrogini-logo" width="78" height="78" alt="MetroGini" style="display:block;border:0;outline:none;" />
       </td>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetroGini Order Receipt</title>
</head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:Arial,Helvetica,sans-serif;color:#000000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;">
          <!-- Header (matches PDF gray band) -->
          <tr>
            <td style="background:#F3F3F3;padding:30px 40px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:18px;font-weight:bold;color:#000000;">MetroGini</td>
                  <td style="font-size:11px;color:#6A6A6A;text-align:right;">${escapeHtml(issued)}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td valign="top" style="padding-right:16px;">
                    <div style="font-size:24px;font-weight:bold;color:#000000;line-height:1.25;margin:0 0 10px;">${greeting}</div>
                    <div style="font-size:13px;color:#6A6A6A;line-height:1.4;">${subtitle}</div>
                  </td>
                  ${logoCell}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Total -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:18px;color:#000000;vertical-align:bottom;padding-bottom:4px;">Total</td>
                  <td style="font-size:28px;font-weight:bold;color:#000000;text-align:right;">${total}</td>
                </tr>
              </table>
              <div style="border-top:1px solid #E8E8E8;margin-top:20px;"></div>
            </td>
          </tr>

          <!-- Breakdown -->
          <tr>
            <td style="padding:16px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${gstRows}
                <tr>
                  <td style="padding:10px 0;font-size:14px;color:#000000;">Grand total (incl. GST)</td>
                  <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${total}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:14px;color:#000000;">Advance paid</td>
                  <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${advance}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;font-size:14px;color:#000000;">${amountRowLabel}</td>
                  <td style="padding:10px 0;font-size:14px;color:#000000;text-align:right;">${remaining}</td>
                </tr>
              </table>
              <div style="border-top:1px solid #E8E8E8;margin-top:12px;"></div>
            </td>
          </tr>

          <!-- Payments -->
          <tr>
            <td style="padding:22px 40px 0;">
              <div style="font-size:18px;font-weight:bold;color:#000000;margin:0 0 18px;">Payments</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="40" valign="top">
                    <div style="width:28px;height:28px;line-height:28px;text-align:center;background:${payIconBg};color:#FFFFFF;font-size:11px;font-weight:bold;border-radius:6px;">${payIcon}</div>
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="font-size:14px;color:#000000;">${payLabel}</div>
                    <div style="font-size:12px;color:#6A6A6A;margin-top:2px;">${paySub}</div>
                  </td>
                  <td valign="middle" style="font-size:14px;color:#000000;text-align:right;white-space:nowrap;">${remaining}</td>
                </tr>
              </table>
              <div style="border-top:1px solid #E8E8E8;margin-top:22px;"></div>
            </td>
          </tr>

          <!-- Legal + PDF note -->
          <tr>
            <td style="padding:16px 40px 28px;">
              <p style="margin:0;font-size:9px;line-height:1.5;color:#8A8A8A;">
                Not a GST invoice. Order ${safeOrderRef} · Invoice ${safeInvoiceId} · Weight ${escapeHtml(weight)} · ${escapeHtml(clothes)} clothes. MetroGini does not replace formal GST invoices where applicable.
              </p>
              ${
                hasPdf
                  ? `<p style="margin:14px 0 0;font-size:12px;color:#6A6A6A;">Your ${isPaid ? "invoice" : "billing summary"} PDF is attached to this email.</p>`
                  : ""
              }
            </td>
          </tr>

          <!-- Black footer (matches PDF) -->
          <tr>
            <td style="background:#000000;padding:26px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="top">
                    <div style="font-size:22px;font-weight:bold;color:#FFFFFF;line-height:1.2;">MetroGini</div>
                    <div style="font-size:12px;color:#A0A0A0;margin-top:10px;">Laundry · Order Receipt</div>
                  </td>
                  <td valign="top" style="text-align:right;">
                    <div style="font-size:12px;color:#BDBDBD;">Order receipt</div>
                    <div style="font-size:11px;color:#8A8A8A;margin-top:6px;">${safeInvoiceId}</div>
                    <div style="font-size:10px;color:#8A8A8A;margin-top:4px;">${safeOrderRef}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const sendEmail = async ({ to, subject, html, attachments }) => {
  if (!to?.trim()) return;

  const transport = getEmailTransporter();
  if (!transport) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[email] SMTP not configured — skipping:", subject, "→", to);
    }
    return;
  }

  await transport.sendMail({
    from: getEmailFrom(),
    to: to.trim(),
    subject,
    html,
    attachments: attachments?.length ? attachments : undefined,
  });
};

export const getUserEmailInfo = async (userId) => {
  const { rows } = await sql.query(
    `SELECT email, full_name, mobile FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] || null;
};

const greet = (name) => (name ? `Hi ${name},` : "Hi,");

export const sendOtpEmail = async ({ email, name, otp }) => {
  const html = baseTemplate(
    "Your Login OTP",
    `
      <p>${greet(name)}</p>
      <p>Your OTP for creating your Metrogini account is below. Valid for 10 minutes. Do not share this code with anyone.</p>
      <div class="otp-box">${otp}</div>
      <p>If you did not request this OTP, you can safely ignore this email.</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: "Your Metrogini OTP",
    html,
  });
};

export const sendPickupOtpEmail = async ({
  email,
  name,
  otp,
  orderId,
  orderCode,
}) => {
  const orderRef = orderCode || `#${orderId}`;
  const html = baseTemplate(
    "Pickup OTP",
    `
      <p>${greet(name)}</p>
      <p>Your laundry pickup for order <strong>${orderRef}</strong> is scheduled for today.</p>
      <p>Share this OTP with the rider when they arrive to hand over your clothes:</p>
      <div class="otp-box">${otp}</div>
      <p>Please keep your clothes ready for pickup.</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: `Pickup OTP for order ${orderRef} — Metro Gini`,
    html,
  });
};

export const sendDeliveryOtpEmail = async ({
  email,
  name,
  otp,
  orderId,
  orderCode,
}) => {
  const orderRef = orderCode || `#${orderId}`;
  const html = baseTemplate(
    "Delivery OTP",
    `
      <p>${greet(name)}</p>
      <p>Your order <strong>${orderRef}</strong> is packed and ready for delivery.</p>
      <p>Share this OTP with the rider when you receive your laundry:</p>
      <div class="otp-box">${otp}</div>
      <p>Do not share this OTP until you have received your order.</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: `Delivery OTP for order ${orderRef} — Metro Gini`,
    html,
  });
};

export const sendOrderCreatedEmail = async ({
  email,
  name,
  orderId,
  orderCode,
  estimatedTotal,
}) => {
  const orderRef = orderCode || `#${orderId}`;
  const html = baseTemplate(
    "Order Created",
    `
      <p>${greet(name)}</p>
      <p>Your laundry order <strong>${orderRef}</strong> has been created successfully.</p>
      ${estimatedTotal != null ? `<p>Estimated total: <span class="amount">₹${estimatedTotal}</span></p>` : ""}
      <p>Please complete the advance payment to confirm your booking and schedule pickup.</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: `Order ${orderRef} created — Metro Gini`,
    html,
  });
};

export const sendAdvancePaymentEmail = async ({
  email,
  name,
  orderId,
  orderCode,
  amount,
}) => {
  const orderRef = orderCode || `#${orderId}`;
  const html = baseTemplate(
    "Advance Payment Received",
    `
      <p>${greet(name)}</p>
      <p>We have received your advance payment for order <strong>${orderRef}</strong>.</p>
      <p>Amount paid: <span class="amount">₹${amount}</span></p>
      <p>Your order is now confirmed. A rider will be assigned for pickup on your scheduled date.</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: `Advance payment of ₹${amount} received — Metro Gini`,
    html,
  });
};

export const sendFullPaymentEmail = async ({
  email,
  name,
  orderId,
  orderCode,
  amount,
  paymentMethod = "Online",
}) => {
  const orderRef = orderCode || `#${orderId}`;

  let attachments = [];
  let invoiceId = null;
  let order = null;
  let hasPdf = false;

  try {
    if (orderId) {
      const invoice = await ensureUserOrderInvoiceFile(orderId, {
        force: true,
        paymentMethod,
      });
      attachments = [
        {
          filename: invoice.filename || `order-${orderId}-receipt.pdf`,
          path: invoice.absPath,
          contentType: "application/pdf",
        },
      ];
      invoiceId = invoice.invoice_id;
      order = invoice.order || null;
      hasPdf = true;
    }
  } catch (error) {
    console.error("[email] Order invoice PDF failed:", error.message);
  }

  const isPaid = order?.is_paid === true || order?.payment_status === "paid";
  const finalTotal =
    order?.final_total != null ? Number(order.final_total) : Number(amount);
  const advancePaid =
    order?.advance_paid != null ? Number(order.advance_paid) : 0;
  const remainingPaid =
    order?.remaining_paid != null
      ? Number(order.remaining_paid)
      : Number(amount);
  const subtotalBeforeGst =
    order?.subtotal_before_gst != null
      ? Number(order.subtotal_before_gst)
      : null;
  const gstAmount = order?.gst != null ? Number(order.gst) : null;
  const cgstAmount = order?.cgst != null ? Number(order.cgst) : null;
  const sgstAmount = order?.sgst != null ? Number(order.sgst) : null;
  const displayInvoiceId = invoiceId || (orderId ? `INV-ORD-${orderId}` : "—");

  const weightInfo =
    order?.actual_weight != null
      ? `${Number(order.actual_weight).toFixed(1)} kg`
      : order?.estimated_weight_min != null
        ? `${order.estimated_weight_min}–${order.estimated_weight_max} kg (est.)`
        : null;
  const clothesInfo =
    order?.actual_clothes_count != null
      ? String(order.actual_clothes_count)
      : order?.clothes_count != null
        ? `${order.clothes_count} (est.)`
        : null;

  const paidAt = order?.payment_completed_at
    ? new Date(order.payment_completed_at)
    : new Date();
  const includeLogo = fs.existsSync(LOGO_PATH);

  if (includeLogo) {
    attachments.push({
      filename: "logo.png",
      path: LOGO_PATH,
      cid: "metrogini-logo",
      contentType: "image/png",
    });
  }

  const html = buildInvoiceReceiptEmailHtml({
    name: name || order?.user_name || "Customer",
    orderRef,
    invoiceId: displayInvoiceId,
    issued: formatIssuedDate(),
    isPaid,
    finalTotal,
    advancePaid,
    remainingPaid,
    subtotalBeforeGst,
    cgstAmount,
    sgstAmount,
    gstAmount,
    payWhen: formatIssuedDate(paidAt),
    weightInfo,
    clothesInfo,
    hasPdf,
    includeLogo,
  });

  await sendEmail({
    to: email,
    subject: isPaid
      ? `Invoice ${displayInvoiceId} for order ${orderRef} — Metro Gini`
      : `Billing summary for order ${orderRef} (payment pending) — Metro Gini`,
    html,
    attachments: attachments.length ? attachments : undefined,
  });
};

/** Dedicated invoice email (same template as full payment receipt). */
export const sendInvoiceEmail = sendFullPaymentEmail;

/** Verify SMTP connection (for health checks / test endpoint). */
export const verifySmtpConnection = async () => {
  if (!isEmailEnabled()) {
    throw { status: 503, message: "SMTP is not configured" };
  }

  const transport = getEmailTransporter();
  await transport.verify();
  return true;
};

export const sendTestEmail = async ({ to, name }) => {
  if (!to?.trim()) {
    throw { status: 400, message: "to (recipient email) is required" };
  }

  await verifySmtpConnection();

  const html = baseTemplate(
    "SMTP Test",
    `
      <p>${greet(name)}</p>
      <p>This is a test email from Metro Gini. Your SMTP configuration is working correctly.</p>
      <p>Sent at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
    `,
  );

  await sendEmail({
    to,
    subject: "Metro Gini — SMTP test email",
    html,
  });

  return { to: to.trim() };
};

/** Admin helper: send invoice/billing email for an existing order (does not change payment status). */
export const sendTestInvoiceEmail = async ({
  orderId,
  to,
  paymentMethod,
}) => {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "order_id must be a positive integer" };
  }

  await verifySmtpConnection();

  const { rows } = await sql.query(
    `SELECT o.id, o.order_code, o.final_total, o.remaining_amount, o.amount_paid,
            o.payment_status,
            u.email, u.full_name
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [id],
  );

  if (!rows[0]) {
    throw { status: 404, message: "Order not found" };
  }

  const order = rows[0];
  const recipient = (to || order.email || "").trim();
  if (!recipient) {
    throw {
      status: 400,
      message: "Recipient email missing. Pass body.to or set email on the user.",
    };
  }

  const isPaid = order.payment_status === "paid";
  const amountDue =
    order.remaining_amount != null
      ? Number(order.remaining_amount)
      : Math.max(
          0,
          Number(order.final_total || 0) - Number(order.amount_paid || 0),
        );

  const resolvedMethod = isPaid
    ? paymentMethod || "Online"
    : paymentMethod || "Not paid yet";

  await sendFullPaymentEmail({
    email: recipient,
    name: order.full_name,
    orderId: order.id,
    orderCode: order.order_code,
    amount: isPaid
      ? Number(order.amount_paid || order.final_total || 0)
      : amountDue,
    paymentMethod: resolvedMethod,
  });

  return {
    order_id: order.id,
    order_code: order.order_code,
    to: recipient,
    payment_status: order.payment_status,
    amount: isPaid
      ? Number(order.amount_paid || order.final_total || 0)
      : amountDue,
    payment_method: resolvedMethod,
  };
};

/** Send email without failing the caller (fire-and-forget safe wrapper). */
export const sendEmailSafe = async (fn, ...args) => {
  if (!isEmailEnabled()) return;

  try {
    await fn(...args);
  } catch (error) {
    console.error("[email] Send failed:", error.message);
  }
};

/** Fetch user by id and send email if they have an address on file. */
export const sendUserEmailSafe = async (userId, sendFn, payload) => {
  if (!isEmailEnabled() || !userId) return;

  try {
    const user = await getUserEmailInfo(userId);
    if (!user?.email?.trim()) return;

    await sendFn({
      email: user.email,
      name: user.full_name,
      ...payload,
    });
  } catch (error) {
    console.error("[email] Send failed:", error.message);
  }
};
