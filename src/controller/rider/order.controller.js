import {
  fetchTodayOrders,
  fetchDashboardCount,
  startDelivery,
  verifyOtp,
  resendOtp,
  fetchOrderHistory,
  handoverToVendorService,
} from "../../services/rider/riderOrder.service.js";

export const getTodayOrderList = async (req, res, next) => {
  try {
    const data = await fetchTodayOrders(req.user.rider_id);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    next(err);
  }
};

export const getDashboardCount = async (req, res, next) => {
  try {
    const data = await fetchDashboardCount(req.user.rider_id);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    next(err);
  }
};

export const startOrderDelivery = async (req, res, next) => {
  try {
    await startDelivery(req.user.rider_id, req.params.id);
    return res
      .status(200)
      .json({
        success: true,
        message: `Delivery started for Order Id = ORD-${req.params.id}`,
      });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const verifyDeliveryOtp = async (req, res, next) => {
  try {
    await verifyOtp(req.user.rider_id, req.body.order_id, req.body.otp);
    return res
      .status(200)
      .json({ success: true, message: "Delivery completed successfully" });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const resendDeliveryOtp = async (req, res, next) => {
  try {
    const otp = await resendOtp(req.user.rider_id, req.body.order_id);
    return res
      .status(200)
      .json({ success: true, message: "OTP sent to customer", otp }); // Remove otp in Prod
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const handoverToVendor = async (req, res , next) => {
  try {
    const rider_id = req.user.rider_id; // ✅ from token
    const { order_id, vendor_id } = req.body;

    if (!order_id || !vendor_id) {
      return res.status(400).json({
        success: false,
        message: "order_id and vendor_id are required"
      });
    }

    const data = handoverToVendorService(rider_id, order_id, vendor_id);

    return res.status(200).json({
      success: true,
      message: "Order successfully handed over to vendor"
    });

  } catch (error) {
    next(error);
  }
};

export const getOrderHistory = async (req, res, next) => {
  try {
    const { total, page, limit, data } = await fetchOrderHistory(
      req.user.rider_id,
      req.query,
    );
    return res.status(200).json({
      success: true,
      page,
      limit,
      total_orders: total,
      total_pages: Math.ceil(total / limit),
      data,
    });
  } catch (err) {
    next(err);
  }
};
