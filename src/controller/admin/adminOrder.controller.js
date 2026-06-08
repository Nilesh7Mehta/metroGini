import { getAdminOrdersService } from '../../services/admin/adminOrder.service.js';

export const getAdminOrders = async (req, res, next) => {
  try {
    const data = await getAdminOrdersService(req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
