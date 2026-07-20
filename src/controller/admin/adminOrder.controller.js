import {
  getAdminOrdersService,
  getAdminOrderDetailsService,
  getAdminOrderOperationsService,
} from '../../services/admin/adminOrder.service.js';

export const getAdminOrders = async (req, res, next) => {
  try {
    const data = await getAdminOrdersService(req.query);
    return res.status(200).json({
      success: true,
      message: 'Orders fetched successfully',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const getAdminOrderDetails = async (req, res, next) => {
  try {
    const data = await getAdminOrderDetailsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const getAdminOrderOperations = async (req, res, next) => {
  try {
    const data = await getAdminOrderOperationsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};
