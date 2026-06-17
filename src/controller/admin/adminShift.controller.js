import { createShift, updateShift } from '../../services/admin/adminShift.service.js';

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const addShift = async (req, res, next) => {
  try {
    const data = await createShift(req.body);

    return res.status(201).json({
      success: true,
      message: 'Shift added successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateShiftById = async (req, res, next) => {
  try {
    const data = await updateShift(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Shift updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
