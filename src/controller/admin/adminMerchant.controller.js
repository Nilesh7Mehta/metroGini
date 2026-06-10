import {
  getAdminMerchantsService,
  getAdminMerchantDetailsService,
  getAdminMerchantOrdersService,
} from '../../services/admin/adminMerchant.service.js';

export const getAdminMerchants = async (req, res, next) => {
  try {
    const data = await getAdminMerchantsService(req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const getAdminMerchantDetails = async (req, res, next) => {
  try {
    const data = await getAdminMerchantDetailsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const getAdminMerchantOrders = async (req, res, next) => {
  try {
    const data = await getAdminMerchantOrdersService(req.params.id, req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
