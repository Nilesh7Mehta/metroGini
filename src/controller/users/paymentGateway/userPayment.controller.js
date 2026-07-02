import * as checkoutService from "../../../services/users/payment/razorpayCheckout.service.js";
import { handleRazorpayWebhook } from "../../../services/users/payment/razorpayWebhook.service.js";
import { verifyPaymentSignature } from "../../../services/users/payment/razorpay.util.js";

const handleServiceError = (error, res, next) => {
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }
  return next(error);
};

export const dummyPay = async (req, res, next) => {
  try {
    const data = await checkoutService.processDummyPay({
      orderId: req.params.id,
      userId: req.user.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (error) {
    return handleServiceError(error, res, next);
  }
};

export const createOrderRazorPay = async (req, res, next) => {
  try {
    const data = await checkoutService.createRazorpayOrder({
      orderId: req.params.id,
      userId: req.user.id,
      body: req.body,
    });
    return res.status(200).json(data);
  } catch (error) {
    return handleServiceError(error, res, next);
  }
};

export const verifyOrderRazorPay = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required",
        verified: false,
      });
    }

    const verified = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!verified) {
      return res.status(400).json({ message: "Invalid payment signature", verified: false });
    }

    return res.status(200).json({ message: "Payment verified successfully", verified: true });
  } catch (error) {
    next(error);
  }
};

export const razorpayWebhook = async (req, res, next) => {
  try {
    const result = await handleRazorpayWebhook(
      req.body,
      req.headers["x-razorpay-signature"],
    );

    if (typeof result.body === "string") {
      return res.status(result.status).send(result.body);
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};
