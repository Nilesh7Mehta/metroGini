import { orderDashboardService, getVendorOrdersService, getOrderDetailsService, confirmClothesService, confirmWeightService, finalizeOrderService, markReadyForDeliveryService } from '../../services/vendor/vendorOrder.service.js';

const VALID_FILTERS = ['today', 'this_week', 'this_month'];

export const orderDashboard = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    // console.log("Vendor Id===============" , vendor_id);
    const filter = VALID_FILTERS.includes(req.query.filter) ? req.query.filter : 'today';
    const data = await orderDashboardService(vendor_id, filter);
    return res.status(200).json({
      success: true,
      message: 'Order dashboard fetched successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
};


export const getVendorOrders = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const selectedDate = req.query.date || req.query.selected_date;
    const data = await getVendorOrdersService(vendor_id, selectedDate);
    const totalOrders = data.shifts.reduce((sum, shift) => sum + shift.total_orders, 0);
    return res.status(200).json({
      success: true,
      message:
        totalOrders > 0
          ? 'Orders fetched successfully'
          : 'No orders found for the selected date',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderDetails = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    
    const data = await getOrderDetailsService(vendor_id, order_id);
    return res.status(200).json({
      success: true,
      message: 'Order details fetched successfully',
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmClothes = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    const { actual_clothes } = req.body;

    if (!actual_clothes || actual_clothes <= 0) {
      return res.status(400).json({ success: false, message: 'actual_clothes must be a positive number' });
    }

    const data = await confirmClothesService(vendor_id, order_id, actual_clothes);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const confirmWeight = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    const { actual_weight, is_stained, vendor_request_amount } = req.body;

    if (!actual_weight || actual_weight <= 0) {
      return res.status(400).json({ success: false, message: 'actual_weight must be a positive number' });
    }

    if (is_stained === undefined || is_stained === null || is_stained === '') {
      return res.status(400).json({ success: false, message: 'is_stained is required (0 or 1)' });
    }

    const stained = parseInt(is_stained, 10);
    const stain_image = req.file ? `uploads/order-stains/${req.file.filename}` : null;

    const data = await confirmWeightService(vendor_id, order_id, {
      actual_weight,
      is_stained: stained,
      stain_image,
      vendor_request_amount,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const finalizeOrder = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;

    const data = await finalizeOrderService(vendor_id, order_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const markReadyForDelivery = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;

    const data = await markReadyForDeliveryService(vendor_id, order_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
