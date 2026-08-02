
import sql from "../../config/db.js";
import { getEmailFrom, getEmailTransporter, isEmailEnabled } from "../../config/email.js";
import { ensureUserOrderInvoiceFile } from "../../utils/userOrderInvoice.util.js";

const formatInr = (value) => {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return `₹${safe.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

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
    .invoice-badge { display: inline-block; background: #ecfdf5; color: #047857; font-size: 12px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; padding: 6px 10px; border-radius: 999px; margin-bottom: 12px; }
    .invoice-total { text-align: center; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .invoice-total .label { margin: 0; font-size: 13px; color: #6b7280; }
    .invoice-meta { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    .invoice-meta td { padding: 8px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .invoice-meta td:first-child { color: #6b7280; width: 42%; }
    .invoice-meta td:last-child { text-align: right; font-weight: 600; color: #111827; }
    .invoice-meta tr.total td { border-bottom: none; padding-top: 12px; font-size: 15px; }
    .invoice-meta tr.total td:last-child { color: #059669; }
    .invoice-meta tr.section td { border-bottom: none; padding-top: 16px; padding-bottom: 4px; color: #111827; font-weight: 700; text-align: left; }
    .invoice-meta tr.muted td:last-child { font-weight: 500; color: #374151; }
    .gst-note { font-size: 12px; color: #6b7280; margin: 0 0 8px; }
    .attachment-note { background: #f8fafc; border-left: 3px solid #1a56db; padding: 12px 14px; margin: 16px 0; font-size: 13px; color: #374151; }
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

  let attachments;
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
  const methodLabel = isPaid
    ? String(paymentMethod || "Online")
    : "Not paid yet";
  const finalTotal =
    order?.final_total != null ? Number(order.final_total) : Number(amount);
  const advancePaid = order?.advance_paid != null ? Number(order.advance_paid) : null;
  const remainingPaid =
    order?.remaining_paid != null ? Number(order.remaining_paid) : Number(amount);
  const subtotalBeforeGst =
    order?.subtotal_before_gst != null ? Number(order.subtotal_before_gst) : null;
  const gstAmount = order?.gst != null ? Number(order.gst) : null;
  const cgstAmount = order?.cgst != null ? Number(order.cgst) : null;
  const sgstAmount = order?.sgst != null ? Number(order.sgst) : null;
  const cgstRate = order?.cgst_rate != null ? Number(order.cgst_rate) : 9;
  const sgstRate = order?.sgst_rate != null ? Number(order.sgst_rate) : 9;
  const gstRate = order?.gst_rate != null ? Number(order.gst_rate) : 18;
  const invoiceLines = Array.isArray(order?.invoice_lines)
    ? order.invoice_lines
    : [];
  const weightInfo =
    order?.actual_weight != null
      ? `${Number(order.actual_weight).toFixed(1)} kg`
      : null;
  const clothesInfo =
    order?.clothes_count != null ? String(order.clothes_count) : null;
  const displayInvoiceId = invoiceId || (orderId ? `INV-ORD-${orderId}` : "—");
  const safeOrderRef = escapeHtml(orderRef);
  const safeMethod = escapeHtml(methodLabel);
  const safeInvoiceId = escapeHtml(displayInvoiceId);

  const chargeRows = invoiceLines
    .map((line) => {
      const label = escapeHtml(line.name || "Charge");
      const value = formatInr(line.amount);
      return `<tr class="muted"><td>${label}</td><td>${value}</td></tr>`;
    })
    .join("");

  const intro = isPaid
    ? `<p>Payment for order <strong>${safeOrderRef}</strong> is complete. Here is your invoice summary with GST breakdown.</p>`
    : `<p>Here is the billing summary for order <strong>${safeOrderRef}</strong>. <strong>Payment is still pending</strong> — no cash/online payment has been collected yet.</p>`;

  const amountBoxLabel = isPaid ? "Amount paid" : "Amount due";
  const amountBoxValue = formatInr(isPaid ? amount : remainingPaid || finalTotal);

  const html = baseTemplate(
    isPaid ? "Your Invoice" : "Billing Summary",
    `
      <div class="invoice-badge">${isPaid ? "Invoice" : "Payment pending"}</div>
      <p>${greet(name)}</p>
      ${intro}

      <div class="invoice-total">
        <p class="label">${amountBoxLabel}</p>
        <p class="amount" style="margin: 4px 0 0;">${amountBoxValue}</p>
      </div>

      <table class="invoice-meta" role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td>Invoice ID</td>
          <td>${safeInvoiceId}</td>
        </tr>
        <tr>
          <td>Order</td>
          <td>${safeOrderRef}</td>
        </tr>
        <tr>
          <td>Payment method</td>
          <td>${safeMethod}</td>
        </tr>
        ${
          weightInfo
            ? `<tr>
          <td>Weight</td>
          <td>${escapeHtml(weightInfo)}</td>
        </tr>`
            : ""
        }
        ${
          clothesInfo
            ? `<tr>
          <td>Clothes</td>
          <td>${escapeHtml(clothesInfo)}</td>
        </tr>`
            : ""
        }

        <tr class="section"><td colspan="2">Billing breakdown</td></tr>
        ${chargeRows}
        ${
          subtotalBeforeGst != null
            ? `<tr>
          <td>Taxable value</td>
          <td>${formatInr(subtotalBeforeGst)}</td>
        </tr>`
            : ""
        }
        ${
          cgstAmount != null
            ? `<tr class="muted">
          <td>CGST (${cgstRate}%)</td>
          <td>${formatInr(cgstAmount)}</td>
        </tr>`
            : ""
        }
        ${
          sgstAmount != null
            ? `<tr class="muted">
          <td>SGST (${sgstRate}%)</td>
          <td>${formatInr(sgstAmount)}</td>
        </tr>`
            : ""
        }
        ${
          gstAmount != null
            ? `<tr>
          <td>GST total (${gstRate}%)</td>
          <td>${formatInr(gstAmount)}</td>
        </tr>`
            : ""
        }
        ${
          advancePaid != null
            ? `<tr>
          <td>Advance paid</td>
          <td>${formatInr(advancePaid)}</td>
        </tr>`
            : ""
        }
        <tr>
          <td>${isPaid ? "Remaining / final payment" : "Amount due"}</td>
          <td>${formatInr(remainingPaid)}</td>
        </tr>
        <tr class="total">
          <td>Grand total (incl. GST)</td>
          <td>${formatInr(finalTotal)}</td>
        </tr>
      </table>

      <p class="gst-note">GST is charged at ${gstRate}% (CGST ${cgstRate}% + SGST ${sgstRate}%). This email/receipt is for your records and may not replace a formal GST tax invoice where applicable.</p>

      ${
        hasPdf
          ? `<div class="attachment-note">Your ${isPaid ? "invoice" : "billing summary"} PDF is attached to this email.</div>`
          : ""
      }

      <p>Thank you for using Metro Gini. We hope to serve you again soon!</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: isPaid
      ? `Invoice ${displayInvoiceId} for order ${orderRef} — Metro Gini`
      : `Billing summary for order ${orderRef} (payment pending) — Metro Gini`,
    html,
    attachments,
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
