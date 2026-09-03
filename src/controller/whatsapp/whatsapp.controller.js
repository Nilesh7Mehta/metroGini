import * as authService from "../../services/whatsapp/whatsappAuth.service.js";
import * as crmService from "../../services/whatsapp/whatsappCrm.service.js";
import * as orderService from "../../services/whatsapp/whatsappOrder.service.js";
import {
  emitWhatsappEvent,
  emitWhatsappOrderEventSafe,
} from "../../services/whatsapp/whatsappEvents.service.js";

const handleError = (res, err, next) => {
  if (err?.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

export const createSession = async (req, res, next) => {
  try {
    const result = await authService.createWhatsappSession({
      mobile: req.body?.mobile,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const lookupCustomer = async (req, res, next) => {
  try {
    const mobile = req.body?.mobile ?? req.query?.mobile;
    const result = await authService.lookupWhatsappCustomer({ mobile });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const inactiveAppUsers = async (req, res, next) => {
  try {
    const result = await crmService.listInactiveAppUsers({
      hours: req.query.hours,
      limit: req.query.limit,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const abandonedBooking = async (req, res, next) => {
  try {
    const mobile = req.params.mobile || req.query.mobile;
    const result = await crmService.getAbandonedBooking({ mobile });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const winbackUsers = async (req, res, next) => {
  try {
    const result = await crmService.listWinbackUsers({
      days: req.query.days,
      total_orders: req.query.total_orders,
      limit: req.query.limit,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const activeOrderByMobile = async (req, res, next) => {
  try {
    const result = await orderService.getActiveOrderByMobile({
      mobile: req.query.mobile,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const orderRider = async (req, res, next) => {
  try {
    const result = await orderService.getOrderRider({
      orderId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

export const delayStatus = async (req, res, next) => {
  try {
    const result = await orderService.getDelayStatus({
      orderId: req.params.id,
    });
    return res.status(200).json(result);
  } catch (err) {
    handleError(res, err, next);
  }
};

/** Manual / test emit to Gallabox webhook */
export const emitEvent = async (req, res, next) => {
  try {
    const { event, order_id, mobile, data } = req.body || {};
    if (!event) {
      return res.status(400).json({
        success: false,
        message: "event is required",
      });
    }

    if (order_id) {
      await emitWhatsappOrderEventSafe(event, order_id, data || {});
      return res.status(200).json({
        success: true,
        message: "Event queued for order",
        data: { event, order_id },
      });
    }

    const result = await emitWhatsappEvent(event, {
      order_id: null,
      mobile,
      data: data || {},
    });
    return res.status(200).json({
      success: true,
      message: result.skipped
        ? "Webhook skipped (disabled or URL missing)"
        : result.ok
          ? "Event sent"
          : "Event send failed",
      data: result,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
