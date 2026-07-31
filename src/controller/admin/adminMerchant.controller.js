import {
  getAdminMerchantsService,
  getAdminMerchantDetailsService,
  getAdminMerchantOrdersService,
  getAdminMerchantsOverviewService,
  createAdminMerchantService,
  updateAdminMerchantService,
} from '../../services/admin/adminMerchant.service.js';
import { mapShiftScheduleError } from '../../services/common/laundryGroupShiftSchedule.service.js';

export const createAdminMerchant = async (req, res, next) => {
  try {
    const data = await createAdminMerchantService(req.body);
    return res.status(201).json({
      success: true,
      message: 'Merchant created successfully',
      data,
    });
  } catch (err) {
    const shiftErr = await mapShiftScheduleError(err);
    if (shiftErr) {
      return res.status(shiftErr.status).json({ success: false, message: shiftErr.message });
    }
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const updateAdminMerchant = async (req, res, next) => {
  try {
    const data = await updateAdminMerchantService(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Merchant updated successfully',
      data,
    });
  } catch (err) {
    const shiftErr = await mapShiftScheduleError(err);
    if (shiftErr) {
      return res.status(shiftErr.status).json({ success: false, message: shiftErr.message });
    }
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

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

export const getAdminMerchantsOverview = async (req, res, next) => {
  try {
    const data = await getAdminMerchantsOverviewService(req.query);
    return res.status(200).json({
      success: true,
      message: 'Merchants overview fetched successfully',
      data,
    });
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
    return res.status(200).json({
      success: true,
      message: 'Merchant orders fetched successfully',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
