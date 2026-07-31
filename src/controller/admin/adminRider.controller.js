import {
  createAdminRiderService,
  updateAdminRiderService,
  getAdminRidersService,
  getAdminRiderDetailsService,
  getAdminRiderOrdersService,
  getAdminRidersOverviewService,
} from '../../services/admin/adminRider.service.js';
import { mapRiderScheduleError } from '../../services/common/riderGroupShiftSchedule.service.js';

export const getAdminRiders = async (req, res, next) => {
  try {
    const data = await getAdminRidersService(req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getAdminRidersOverview = async (req, res, next) => {
  try {
    const data = await getAdminRidersOverviewService(req.query);
    return res.status(200).json({
      success: true,
      message: 'Riders overview fetched successfully',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getAdminRiderDetails = async (req, res, next) => {
  try {
    const data = await getAdminRiderDetailsService(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const getAdminRiderOrders = async (req, res, next) => {
  try {
    const data = await getAdminRiderOrdersService(req.params.id, req.query);
    return res.status(200).json({
      success: true,
      message: 'Rider orders fetched successfully',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const updateAdminRider = async (req, res, next) => {
  try {
    const data = await updateAdminRiderService(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Rider updated successfully',
      data,
    });
  } catch (err) {
    const scheduleErr = await mapRiderScheduleError(err);
    if (scheduleErr) {
      return res.status(scheduleErr.status).json({
        success: false,
        message: scheduleErr.message,
      });
    }
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Mobile number already exists',
      });
    }
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};

export const createAdminRider = async (req, res, next) => {
  try {
    const data = await createAdminRiderService(req.body);
    return res.status(201).json({
      success: true,
      message: 'Rider created successfully',
      data,
    });
  } catch (err) {
    const scheduleErr = await mapRiderScheduleError(err);
    if (scheduleErr) {
      return res.status(scheduleErr.status).json({
        success: false,
        message: scheduleErr.message,
      });
    }
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Mobile number already exists',
      });
    }
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
};
