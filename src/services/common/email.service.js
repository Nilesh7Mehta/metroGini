
import sql from "../../config/db.js";
import { getEmailFrom, getEmailTransporter, isEmailEnabled } from "../../config/email.js";
import { ensureUserOrderInvoiceFile } from "../../utils/userOrderInvoice.util.js";

const baseTemplate = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
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
  paymentMethod = "cash",
}) => {
  const orderRef = orderCode || `#${orderId}`;

  let attachments;
  let invoiceNote = "";
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
      invoiceNote = `<p>Your payment receipt is attached as a PDF.</p>`;
    }
  } catch (error) {
    console.error("[email] Order invoice PDF failed:", error.message);
  }

  const html = baseTemplate(
    "Payment Complete",
    `
      <p>${greet(name)}</p>
      <p>Full payment for order <strong>${orderRef}</strong> has been received.</p>
      <p>Amount: <span class="amount">₹${amount}</span> (${paymentMethod})</p>
      ${invoiceNote}
      <p>Thank you for using Metro Gini. We hope to serve you again soon!</p>
    `,
  );

  await sendEmail({
    to: email,
    subject: `Payment complete for order ${orderRef} — Metro Gini`,
    html,
    attachments,
  });
};

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
