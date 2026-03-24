import { orderDashboardService, getOrderDetailsService, confirmClothesService, confirmWeightService } from '../../services/vendor/vendorOrder.service.js';

const VALID_FILTERS = ['today', 'this_week', 'this_month'];

export const orderDashboard = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    console.log("Vendor Id===============" , vendor_id);
    const filter = VALID_FILTERS.includes(req.query.filter) ? req.query.filter : 'today';
    const data = await orderDashboardService(vendor_id, filter);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getOrderDetails = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    
    const data = await getOrderDetailsService(vendor_id, order_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const confirmClothes = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required and must not be empty' });
    }

    const data = await confirmClothesService(vendor_id, order_id, items);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const confirmWeight = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { order_id } = req.params;
    const { actual_weight } = req.body;

    if (!actual_weight || actual_weight <= 0) {
      return res.status(400).json({ success: false, message: 'actual_weight must be a positive number' });
    }

    const data = await confirmWeightService(vendor_id, order_id, actual_weight);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
