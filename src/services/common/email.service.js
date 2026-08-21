
import sql from "../../config/db.js";
import { getEmailFrom, getEmailTransporter, isEmailEnabled } from "../../config/email.js";
import { ensureUserOrderInvoiceFile } from "../../utils/userOrderInvoice.util.js";

/** Public HTTPS assets — Gmail unpacks CID images 2–3s after HTML, so logos must be hosted. */
const EMAIL_ASSET_CDN =
  "https://raw.githubusercontent.com/Nilesh7Mehta/metroGini/main/src/assets/email";
const getEmailLogoUrl = () =>
  process.env.EMAIL_LOGO_URL?.trim() || `${EMAIL_ASSET_CDN}/logo.png`;
const EMAIL_FACEBOOK_ICON_URL = `${EMAIL_ASSET_CDN}/facebook.png`;
const EMAIL_INSTAGRAM_ICON_URL = `${EMAIL_ASSET_CDN}/instagram.png`;
const EMAIL_FOOTER_BG = "#1c8c9c";

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

const otpBoxHtml = (otp) =>
  `<div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#F3F3F3;padding:16px;border-radius:8px;margin:20px 0;color:#000000;">${escapeHtml(otp)}</div>`;

const getSocialUrls = () => ({
  facebook: process.env.SOCIAL_FACEBOOK_URL || "https://www.facebook.com/share/17ecoU7Ko6/",
  instagram: process.env.SOCIAL_INSTAGRAM_URL || "https://www.instagram.com/metrogini",
});

const socialIconHtml = (href, src, alt, padLeft = "0") =>
  `<td style="padding-left:${padLeft};">
     <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
       <img src="${src}" width="28" height="28" alt="${escapeHtml(alt)}" style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:28px;" />
     </a>
   </td>`;

const buildSocialIconsHtml = () => {
  const { facebook, instagram } = getSocialUrls();
  const fbSrc = EMAIL_FACEBOOK_ICON_URL;
  const igSrc = EMAIL_INSTAGRAM_ICON_URL;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
            <tr>
              ${socialIconHtml(facebook, fbSrc, "Facebook")}
              ${socialIconHtml(instagram, igSrc, "Instagram", "10px")}
            </tr>
          </table>`;
};

const buildFooterBrandHtml = () => {
  const logoCell = `<td valign="middle" width="48" style="width:48px;padding:0 4px 0 0;font-size:0;line-height:0;">
         <img src="${escapeHtml(getEmailLogoUrl())}" width="48" height="48" alt="MetroGini" style="display:block;border:0;outline:none;margin:0;padding:0;width:48px;height:48px;border-radius:10px;" />
       </td>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              ${logoCell}
              <td valign="middle" style="padding:0;">
                <div style="font-size:20px;font-weight:bold;color:#FFFFFF;line-height:1.2;font-family:Arial,Helvetica,sans-serif;">MetroGini</div>
                <div style="font-size:13px;font-weight:normal;color:#FFFFFF;line-height:1.3;margin-top:3px;font-family:Arial,Helvetica,sans-serif;">Wash By Kilo</div>
              </td>
            </tr>
          </table>`;
};

const buildEmailFooterHtml = ({ footerMetaHtml = "" }) =>
  `<tr>
     <td style="background:${EMAIL_FOOTER_BG};padding:26px 40px;">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td valign="middle" style="padding-right:16px;">
             ${buildFooterBrandHtml()}
             ${footerMetaHtml}
           </td>
           <td valign="middle" align="right" style="text-align:right;white-space:nowrap;">
             ${buildSocialIconsHtml()}
           </td>
         </tr>
       </table>
     </td>
   </tr>`;

/**
 * Shared MetroGini receipt header/footer (no GST / totals — for OTP and order updates).
 */
const buildReceiptShellEmailHtml = ({
  heading,
  subtitle = "",
  bodyHtml,
  issued = formatIssuedDate(),
  footerTagline = "Laundry",
  footerMeta = [],
}) => {
  const safeHeading = escapeHtml(heading);
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : "";
  const logoCell = `<td width="110" valign="top" style="text-align:right;">
         <img src="${escapeHtml(getEmailLogoUrl())}" width="96" height="96" alt="MetroGini" style="display:block;border:0;outline:none;width:96px;height:96px;" />
       </td>`;

  const footerMetaHtml = (footerMeta || [])
    .filter(Boolean)
    .map(
      (line, i) =>
        `<div style="font-size:${i === 0 ? "11" : "10"}px;color:#99F6E4;margin-top:${i === 0 ? "6" : "4"}px;">${escapeHtml(line)}</div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetroGini</title>
</head>
<body style="margin:0;padding:0;background:#EDEDED;font-family:Arial,Helvetica,sans-serif;color:#000000;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEDED;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;">
          <tr>
            <td style="background:#F3F3F3;padding:30px 40px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:11px;color:#6A6A6A;text-align:right;">${escapeHtml(issued)}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                <tr>
                  <td valign="top" style="padding-right:16px;">
                    <div style="font-size:24px;font-weight:bold;color:#000000;line-height:1.25;margin:0 0 10px;">${safeHeading}</div>
                    ${safeSubtitle ? `<div style="font-size:13px;color:#6A6A6A;line-height:1.4;">${safeSubtitle}</div>` : ""}
                  </td>
                  ${logoCell}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 16px;font-size:14px;line-height:1.6;color:#000000;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 28px;">
              <p style="margin:0;font-size:9px;line-height:1.5;color:#8A8A8A;">
                This is an automated message from MetroGini. Please do not reply to this email.
              </p>
            </td>
          </tr>
          ${buildEmailFooterHtml({ footerTagline, footerMetaHtml })}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Full invoice receipt HTML matching the order invoice PDF layout (GST + payments).
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
  hasPdf,
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

  const logoCell = `<td width="110" valign="top" style="text-align:right;">
         <img src="${escapeHtml(getEmailLogoUrl())}" width="96" height="96" alt="MetroGini" style="display:block;border:0;outline:none;width:96px;height:96px;" />
       </td>`;

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
                  <td style="font-size:11px;color:#6A6A6A;text-align:right;">${escapeHtml(issued)}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
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

          <!-- PDF note -->
          ${
            hasPdf
              ? `<tr>
            <td style="padding:16px 40px 28px;">
              <p style="margin:0;font-size:12px;color:#6A6A6A;">Your ${isPaid ? "invoice" : "billing summary"} PDF is attached to this email.</p>
            </td>
          </tr>`
              : ""
          }

          ${buildEmailFooterHtml({
            footerTagline: "Laundry · Order Receipt",
            footerMetaHtml: `<div style="font-size:11px;color:#99F6E4;margin-top:6px;">${safeInvoiceId}</div>
             <div style="font-size:10px;color:#99F6E4;margin-top:4px;">${safeOrderRef}</div>`,
          })}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const insertEmailLog = async ({
  emailType,
  recipient,
  subject,
  providerMessageId,
  status,
  errorCode,
  errorMessage,
  referenceType,
  referenceId,
  userId,
}) => {
  try {
    await sql.query(
      `INSERT INTO email_logs
         (email_type, recipient, subject, provider_message_id, status,
          error_code, error_message, reference_type, reference_id, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        emailType || "generic",
        recipient || "",
        subject || null,
        providerMessageId || null,
        status,
        errorCode || null,
        errorMessage || null,
        referenceType || null,
        referenceId != null ? referenceId : null,
        userId != null ? userId : null,
      ],
    );
  } catch (error) {
    console.error("[email] Failed to write email_logs:", error.message);
  }
};

const sendEmail = async ({
  to,
  subject,
  html,
  attachments,
  emailType = "generic",
  referenceType = null,
  referenceId = null,
  userId = null,
}) => {
  if (!to?.trim()) return;

  const recipient = to.trim();
  const overrideTo = process.env.EMAIL_OVERRIDE_TO?.trim();
  const finalRecipient = overrideTo ? overrideTo : recipient;
  const transport = getEmailTransporter();
  if (!transport) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[email] SMTP not configured — skipping:",
        subject,
        "→",
        finalRecipient,
      );
    }
    await insertEmailLog({
      emailType,
      recipient: finalRecipient,
      subject,
      status: "skipped",
      errorCode: "smtp_not_configured",
      errorMessage: "SMTP is not configured",
      referenceType,
      referenceId,
      userId,
    });
    return;
  }

  try {
    const info = await transport.sendMail({
      from: getEmailFrom(),
      to: finalRecipient,
      subject,
      html,
      attachments: attachments?.length ? attachments : undefined,
    });

    await insertEmailLog({
      emailType,
      recipient: finalRecipient,
      subject,
      providerMessageId: info?.messageId || null,
      status: "success",
      referenceType,
      referenceId,
      userId,
    });
  } catch (error) {
    await insertEmailLog({
      emailType,
      recipient: finalRecipient,
      subject,
      status: "failed",
      errorCode: error.code || "smtp_error",
      errorMessage: error.message,
      referenceType,
      referenceId,
      userId,
    });
    throw error;
  }
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
  const html = buildReceiptShellEmailHtml({
    heading: "Your Login OTP",
    subtitle: "Secure verification for your MetroGini account",
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(greet(name))}</p>
      <p style="margin:0 0 12px;">Your OTP for creating your MetroGini account is below. Valid for 10 minutes. Do not share this code with anyone.</p>
      ${otpBoxHtml(otp)}
      <p style="margin:0;">If you did not request this OTP, you can safely ignore this email.</p>
    `,
    footerTagline: "Laundry · Account OTP",
  });

  await sendEmail({
    to: email,
    subject: "Your Metrogini OTP",
    html,
    emailType: "otp_login",
    referenceType: "auth",
  });
};

export const sendPickupOtpEmail = async ({
  email,
  name,
  otp,
  orderId,
  orderCode,
}) => {
  // Always show numeric order id in user-facing emails.
  // (orderCode is a separate human-readable code; order.id is the actual id)
  const orderRef =
    orderId != null ? `ORD-${String(orderId).padStart(3, "0")}` : orderCode || "—";
  const safeOrderRef = escapeHtml(orderRef);
  const html = buildReceiptShellEmailHtml({
    heading: "Pickup OTP",
    subtitle: `Order ${safeOrderRef}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(greet(name))}</p>
      <p style="margin:0 0 12px;">Your laundry pickup for order <strong>${safeOrderRef}</strong> is scheduled for today.</p>
      <p style="margin:0 0 12px;">Share this OTP with the rider when they arrive to hand over your clothes:</p>
      ${otpBoxHtml(otp)}
      <p style="margin:0;">Please keep your clothes ready for pickup.</p>
    `,
    footerTagline: "Laundry · Pickup OTP",
    footerMeta: [orderRef],
  });

  await sendEmail({
    to: email,
    subject: `Pickup OTP for order ${orderRef} — MetroGini`,
    html,
    emailType: "otp_pickup",
    referenceType: "order",
    referenceId: orderId,
  });
};

export const sendDeliveryOtpEmail = async ({
  email,
  name,
  otp,
  orderId,
  orderCode,
}) => {
  // Always show numeric order id in user-facing emails.
  const orderRef =
    orderId != null ? `ORD-${String(orderId).padStart(3, "0")}` : orderCode || "—";
  const safeOrderRef = escapeHtml(orderRef);
  const html = buildReceiptShellEmailHtml({
    heading: "Delivery OTP",
    subtitle: `Order ${safeOrderRef}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(greet(name))}</p>
      <p style="margin:0 0 12px;">Your order <strong>${safeOrderRef}</strong> is packed and ready for delivery.</p>
      <p style="margin:0 0 12px;">Share this OTP with the rider when you receive your laundry:</p>
      ${otpBoxHtml(otp)}
      <p style="margin:0;">Do not share this OTP until you have received your order.</p>
    `,
    footerTagline: "Laundry · Delivery OTP",
    footerMeta: [orderRef],
  });

  await sendEmail({
    to: email,
    subject: `Delivery OTP for order ${orderRef} — MetroGini`,
    html,
    emailType: "otp_delivery",
    referenceType: "order",
    referenceId: orderId,
  });
};

const formatEmailDate = (value) => {
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

const getOrderScheduleDates = async (orderId) => {
  if (orderId == null) return { pickupDate: null, deliveryDate: null };

  const { rows } = await sql.query(
    `SELECT pickup_date, delivery_date FROM orders WHERE id = $1`,
    [orderId],
  );
  return {
    pickupDate: rows[0]?.pickup_date ?? null,
    deliveryDate: rows[0]?.delivery_date ?? null,
  };
};

export const sendAdvancePaymentEmail = async ({
  email,
  name,
  orderId,
  orderCode,
  pickupDate,
  deliveryDate,
}) => {
  const orderRef =
    orderId != null ? `ORD-${String(orderId).padStart(3, "0")}` : orderCode || "—";
  const safeOrderRef = escapeHtml(orderRef);

  let resolvedPickupDate = pickupDate;
  let resolvedDeliveryDate = deliveryDate;
  if (resolvedPickupDate == null || resolvedDeliveryDate == null) {
    const schedule = await getOrderScheduleDates(orderId);
    resolvedPickupDate = resolvedPickupDate ?? schedule.pickupDate;
    resolvedDeliveryDate = resolvedDeliveryDate ?? schedule.deliveryDate;
  }

  const pickupLabel = escapeHtml(formatEmailDate(resolvedPickupDate));
  const deliveryLabel = escapeHtml(formatEmailDate(resolvedDeliveryDate));
  const html = buildReceiptShellEmailHtml({
    heading: "Booking Confirmed",
    subtitle: `Order ${safeOrderRef}`,
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(greet(name))}</p>
      <p style="margin:0 0 12px;">Your laundry booking slot has been confirmed successfully.</p>
      <p style="margin:0 0 12px;">Please have your laundry ready on the pickup date mentioned below.</p>
      <p style="margin:0 0 4px;"><strong>Pickup Date:</strong> ${pickupLabel}</p>
      <p style="margin:0 0 12px;"><strong>Delivery Date:</strong> ${deliveryLabel}</p>
      <p style="margin:0;">Thank you for choosing our laundry service. We look forward to serving you!</p>
    `,
    footerTagline: "Laundry · Booking Confirmed",
    footerMeta: [orderRef],
  });

  await sendEmail({
    to: email,
    subject: `Your laundry booking is confirmed — MetroGini`,
    html,
    emailType: "advance_payment",
    referenceType: "order",
    referenceId: orderId,
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
  // Always show numeric order id in user-facing emails.
  const orderRef =
    orderId != null ? `ORD-${String(orderId).padStart(3, "0")}` : orderCode || "—";

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

  const paidAt = order?.payment_completed_at
    ? new Date(order.payment_completed_at)
    : new Date();
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
    hasPdf,
  });

  await sendEmail({
    to: email,
    subject: isPaid
      ? `Invoice ${displayInvoiceId} for order ${orderRef} — MetroGini`
      : `Billing summary for order ${orderRef} (payment pending) — MetroGini`,
    html,
    attachments: attachments.length ? attachments : undefined,
    emailType: "full_payment_invoice",
    referenceType: "order",
    referenceId: orderId,
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

  const sentAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const html = buildReceiptShellEmailHtml({
    heading: "SMTP Test",
    subtitle: "MetroGini email configuration check",
    bodyHtml: `
      <p style="margin:0 0 12px;">${escapeHtml(greet(name))}</p>
      <p style="margin:0 0 12px;">This is a test email from MetroGini. Your SMTP configuration is working correctly.</p>
      <p style="margin:0;">Sent at: ${escapeHtml(sentAt)} IST</p>
    `,
    footerTagline: "Laundry · System Test",
  });

  await sendEmail({
    to,
    subject: "MetroGini — SMTP test email",
    html,
    emailType: "smtp_test",
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
