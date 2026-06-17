import {
  createTimeSlot,
  getTimeSlots,
  updateTimeSlot,
} from '../../services/admin/adminTimeSlot.service.js';

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const getTimeSlot = async (req, res, next) => {
  try {
    const data = await getTimeSlots();

    return res.status(200).json({
      success: true,
      message: 'Time slots retrieved successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addTimeSlot = async (req, res, next) => {
  try {
    const data = await createTimeSlot(req.body);

    return res.status(201).json({
      success: true,
      message: 'Time slot added successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateTimeSlotById = async (req, res, next) => {
  try {
    const data = await updateTimeSlot(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Time slot updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
