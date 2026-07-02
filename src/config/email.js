import nodemailer from "nodemailer";

const isConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL,
  );

let transporter = null;

export const getEmailTransporter = () => {
  if (!isConfigured()) {
    return null;
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      process.env.SMTP_SECURE === "true" || port === 465;
    // Gmail app passwords are shown with spaces but must be used without them
    const pass = String(process.env.SMTP_PASS || "").replace(/\s+/g, "");

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER.trim(),
        pass,
      },
    });
  }

  return transporter;
};

export const getEmailFrom = () => {
  const name = process.env.SMTP_FROM_NAME || "Metro Gini";
  const email = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  return `"${name}" <${email}>`;
};

export const isEmailEnabled = () => isConfigured();
