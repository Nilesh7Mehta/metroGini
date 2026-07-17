import { formatUserOrder } from "../../utils/userOrder.util.js";
import {
  createDraftOrderService,
  updateServiceTypeService,
  updatePickupService,
  updateDeliveryService,
  finalizeOrderService,
  completeOrderService,
  reviewOrderService,
  applyCouponService,
  removeCouponService,
  getUserOrdersService,
  getUserOrderByIdService,
  reschedulePickupService,
  rescheduleDeliveryService,
  cancelServiceService,
  reportOrderIssueService,
} from "../../services/users/userOrder.service.js";

const handleError = (error, res, next) => {
  if (error.status)
    return res.status(error.status).json({ message: error.message, ...error });
  next(error);
};


export const createDraftOrder = async (req, res, next) => {
  try {
    const data = await createDraftOrderService({
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(200)
      .json({ ...data, message: "Order created successfully" });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const updateServiceType = async (req, res, next) => {
  try {
    const order_id = await updateServiceTypeService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(200)
      .json({ order_id, message: "Service type updated successfully" });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const updatePickup = async (req, res, next) => {
  try {
    const order_id = await updatePickupService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(200)
      .json({
        message: "Pickup details updated successfully",
        order_id,
        ...req.body,
      });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const updateDelivery = async (req, res, next) => {
  try {
    await updateDeliveryService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(200)
      .json({
        message: "Delivery details updated successfully",
        order_id: req.params.id,
        ...req.body,
      });
  } catch (error) {
    if (error.status) return res.status(error.status).json(error);
    next(error);
  }
};

export const finalizeOrder = async (req, res, next) => {
  try {
    const { estimated_total, timestamps, booked_at } = await finalizeOrderService({
      order_id: req.params.id,
      user_id: req.user.id,
    });
    return res
      .status(200)
      .json({
        message: "Order finalized successfully",
        order_id: req.params.id,
        estimated_total: estimated_total.toFixed(2),
        timestamps,
        booked_at,
      });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const completeOrderSetup = async (req, res, next) => {
  try {
    const { estimated_total, delivery_date, timestamps, booked_at } =
      await completeOrderService({
        order_id: req.params.id,
        user_id: req.user.id,
        ...req.body,
      });

    return res.status(200).json({
      message: "Order completed successfully",
      order_id: req.params.id,
      delivery_date,
      estimated_total: estimated_total.toFixed(2),
      timestamps,
      booked_at,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const reviewOrder = async (req, res, next) => {
  try {
    const { order, pricing } = await reviewOrderService({
      order_id: req.params.id,
      user_id: req.user.id,
    });
    return res.status(200).json({
      order_id: req.params.id,
      service_details: {
        service_name: order.service_name,
        service_type: order.service_type_name,
        clothes_count: order.clothes_count,
        estimated_weight_range: `${order.estimated_weight_min} - ${order.estimated_weight_max} kg`,
      },
      schedule: {
        pickup: {
          date: order.pickup_date,
          slot: `${order.pickup_start} - ${order.pickup_end}`,
        },
        delivery: {
          date: order.delivery_date,
          slot: `${order.delivery_start} - ${order.delivery_end}`,
        },
      },
      address: order.full_address,
      pricing_breakdown: {
        flat_fee: pricing.flat_fee.toFixed(2),
        service_charge: pricing.service_charge.toFixed(2),
        peak_charge: pricing.peak_charge.toFixed(2),
        coupon: order.coupon_code
          ? {
              coupon_code: order.coupon_code,
              discount_type: order.discount_type,
              discount_value: order.discount_value,
            }
          : null,
        discount: pricing.discount.toFixed(2),
        advance_payment: pricing.advance_payment.toFixed(2),
        remaining_payment:
          pricing.remaining_payment > 0
            ? pricing.remaining_payment.toFixed(2)
            : "0.00",
        total_payable_now: pricing.advance_payment.toFixed(2),
        approx_total: pricing.final_total.toFixed(2),
      },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const applyCoupon = async (req, res, next) => {
  try {
    const pricing = await applyCouponService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res.status(200).json({
      message: "Coupon applied successfully",
      discount_price: pricing.discount_price,
      discount: pricing.discount,
      approx_total: pricing.approx_total,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const removeCoupon = async (req, res, next) => {
  try {
    await removeCouponService({
      order_id: req.params.id,
      user_id: req.user.id,
    });
    return res.status(200).json({ message: "Coupon removed successfully" });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const getUserOrder = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { status, time } = req.query;

    const { rows, total } = await getUserOrdersService({
      user_id: req.user.id,
      page,
      limit,
      status,
      time,
    });

    const formattedOrders = rows.map(formatUserOrder);

    return res.status(200).json({
      status: 200,
      message:
        formattedOrders.length > 0
          ? "Orders fetched successfully"
          : "No orders found",
      data: formattedOrders,
      pagination: {
        total,
        current_page: page,
        total_pages: Math.ceil(total / limit),
        per_page: limit,
      },
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const getUserOrderDetail = async (req, res, next) => {
  try {
    const order = await getUserOrderByIdService({
      user_id: req.user.id,
      order_id: req.params.id,
    });

    return res.status(200).json({
      status: 200,
      message: "Order fetched successfully",
      data: formatUserOrder(order),
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const rescheduleOrderPickup = async (req, res, next) => {
  try {
    await reschedulePickupService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res.status(200).json({ message: "Pickup rescheduled successfully" });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const rescheduleOrderDelivery = async (req, res, next) => {
  try {
    await rescheduleDeliveryService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(200)
      .json({ message: "Delivery rescheduled successfully" });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const cancelService = async (req, res, next) => {
  try {
    const data = await cancelServiceService({
      order_id: req.params.id,
      user_id: req.user.id,
      ...req.body,
    });
    return res.status(200).json({
      message: "Order cancelled successfully. ₹500 coupon added.",
      data,
    });
  } catch (error) {
    handleError(error, res, next);
  }
};

export const reportOrderIssue = async (req, res, next) => {
  try {
    const data = await reportOrderIssueService({
      user_id: req.user.id,
      ...req.body,
    });
    return res
      .status(201)
      .json({ success: true, message: "Issue reported successfully", data });
  } catch (error) {
    handleError(error, res, next);
  }
};
