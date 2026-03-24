import { orderDashboardService } from '../../services/vendor/vendorOrder.service.js';

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
