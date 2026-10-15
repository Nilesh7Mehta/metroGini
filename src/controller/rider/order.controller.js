import {
  fetchTodayOrders,
  fetchTodayDeliveryOrders,
  fetchRiderOrderDetail,
  fetchDashboardCount,
  fetchMissingOrderCounts,
  startDelivery,
  verifyOtp,
  resendOtp,
  fetchOrderHistory,
  fetchMissedPickups,
  fetchMissedDrops,
  handoverToVendorService,
  collectPaymentService,
  createRiderPaymentOrderService,
  pickupFromVendorService,
  verifyDeliveryOtpService,
} from "../../services/rider/riderOrder.service.js";
import { getOptimizedRiderRoute } from "../../services/rider/riderRoute.service.js";
const readRequiredShift = (req, res) => {
  const shift = String(req.query.shift || "").trim();
  if (!shift) {
    res.status(400).json({ status: false, message: "shift is required" });
    return null;
  }
  return shift;
};

export const getTodayOrderList = async (req, res, next) => {
  try {
    const shift = readRequiredShift(req, res);
    if (!shift) return;
    const data = await fetchTodayOrders(req.user.rider_id, shift);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    next(err);
  }
};

export const getRiderOrderDetail = async (req, res, next) => {
  try {
    const data = await fetchRiderOrderDetail(req.user.rider_id, req.params.id);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    next(err);
  }
};

export const getTodayDeliveryOrderList = async (req, res, next) => {
  try {
    const shift = readRequiredShift(req, res);
    if (!shift) return;
    const data = await fetchTodayDeliveryOrders(req.user.rider_id, shift);
    return res.status(200).json({ status: true, data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    next(err);
  }
};

/** Today's pickup + delivery stops — Google Routes optimized sequence. */
export const getOptimizedRoute = async (req, res, next) => {
  try {
    const shift = readRequiredShift(req, res);
    if (!shift) return;
    const data = await getOptimizedRiderRoute(req.user.rider_id, shift);
    return res.status(200).json({
      success: true,
      orderSequence: data.orderSequence,
      latlong: data.latlong,
    });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const getDashboardCount = async (req, res, next) => {
  try {
    const shift = readRequiredShift(req, res);
    if (!shift) return;
    const [data, missing] = await Promise.all([
      fetchDashboardCount(req.user.rider_id, shift),
      fetchMissingOrderCounts(req.user.rider_id),
    ]);
    return res.status(200).json({ status: true, data: { ...data, ...missing } });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ status: false, message: err.message });
    next(err);
  }
};

export const startOrderDelivery = async (req, res, next) => {
  try {
    const data = await startDelivery(req.user.rider_id, req.params.id);
    return res
      .status(200)
      .json({
        success: true,
        message: `Delivery started for Order Id = ORD-${req.params.id}`,
        data,
      });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const verifyPickupOtp = async (req, res, next) => {
  try {
    const data = await verifyOtp(req.user.rider_id, req.body.order_id, req.body.otp);
    return res
      .status(200)
      .json({ success: true, message: "Pick up completed successfully", data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const resendPickupOtp = async (req, res, next) => {
  try {
    const result = await resendOtp(req.user.rider_id, req.body.order_id);
    return res.status(200).json({
      success: true,
      message: "OTP sent to customer",
      ...(result.otp != null ? { otp: result.otp } : {}),
    });
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
    console.log("Rider_id" , rider_id);
    const { order_id, vendor_id } = req.body;

    if (!order_id || !vendor_id) {
      return res.status(400).json({
        success: false,
        message: "order_id and vendor_id are required"
      });
    }

    const data = await handoverToVendorService(rider_id, order_id, vendor_id);

    return res.status(200).json({
      success: true,
      message: "Order successfully handed over to vendor",
      data,
    });

  } catch (error) {
    next(error);
  }
};

export const getOrderHistory = async (req, res, next) => {
  try {
    const { total, page, limit, has_more, data } = await fetchOrderHistory(
      req.user.rider_id,
      req.query,
    );
    return res.status(200).json({
      success: true,
      page,
      limit,
      total_orders: total,
      total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
      has_more,
      data,
    });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const getMissedPickups = async (req, res, next) => {
  try {
    const data = await fetchMissedPickups(req.user.rider_id, req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const getMissedDrops = async (req, res, next) => {
  try {
    const data = await fetchMissedDrops(req.user.rider_id, req.query);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const collectPayment = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required' });
    }

    const data = await collectPaymentService(rider_id, order_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

export const createPaymentOrder = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const order_id = req.params.id;

    const data = await createRiderPaymentOrderService(rider_id, order_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

export const pickupFromVendor = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'order_id is required' });
    }

    const data = await pickupFromVendorService(rider_id, order_id);
    return res.status(200).json({
      success: true,
      message: 'Order picked up from vendor, out for delivery',
      data,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};

export const completeDelivery = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const { order_id, otp } = req.body;

    if (!order_id || !otp) {
      return res.status(400).json({ success: false, message: 'order_id and otp are required' });
    }

    const data = await verifyDeliveryOtpService(rider_id, order_id, otp);
    return res.status(200).json({ success: true, message: 'Delivery completed successfully', data });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
};
