import {
  getAdminOrdersService,
  getAdminOrderDetailsService,
  getAdminOrderOperationsService,
} from '../../services/admin/adminOrder.service.js';

export const getAdminOrders = async (req, res, next) => {
  try {
    const data = await getAdminOrdersService(req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getAdminOrderDetails = async (req, res, next) => {
  try {
    const data = await getAdminOrderDetailsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getAdminOrderOperations = async (req, res, next) => {
  try {
    const data = await getAdminOrderOperationsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
