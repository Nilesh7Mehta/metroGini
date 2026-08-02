import {
  sendTestEmail,
  sendTestInvoiceEmail,
  verifySmtpConnection,
} from "../../services/common/email.service.js";
import { isEmailEnabled } from "../../config/email.js";

export const getEmailStatus = async (req, res, next) => {
  try {
    const configured = isEmailEnabled();

    if (!configured) {
      return res.status(200).json({
        success: true,
        message: "SMTP is not configured",
        data: { configured: false, connected: false },
      });
    }

    await verifySmtpConnection();

    return res.status(200).json({
      success: true,
      message: "SMTP connection verified",
      data: { configured: true, connected: true },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        data: { configured: isEmailEnabled(), connected: false },
      });
    }

    const smtpAuthFailed =
      error.code === "EAUTH" ||
      String(error.message).includes("Username and Password not accepted");

    if (smtpAuthFailed) {
      return res.status(401).json({
        success: false,
        message:
          "SMTP login failed. For Gmail, use an App Password (no spaces in .env) with 2-Step Verification enabled.",
        data: { configured: true, connected: false },
      });
    }

    next(error);
  }
};

export const sendTestEmailHandler = async (req, res, next) => {
  try {
    const { to, name } = req.body;

    const result = await sendTestEmail({ to, name });

    return res.status(200).json({
      success: true,
      message: "Test email sent successfully",
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};

export const sendTestInvoiceEmailHandler = async (req, res, next) => {
  try {
    const order_id = req.body?.order_id ?? req.query?.order_id;
    const to = req.body?.to ?? req.query?.to;
    const payment_method =
      req.body?.payment_method ?? req.query?.payment_method;

    const result = await sendTestInvoiceEmail({
      orderId: order_id,
      to,
      paymentMethod: payment_method,
    });

    return res.status(200).json({
      success: true,
      message: "Invoice email sent successfully",
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
};
