import {
  createServiceType,
  updateServiceType,
} from '../../services/admin/adminServiceType.service.js';

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const addServiceType = async (req, res, next) => {
  try {
    const data = await createServiceType(req.body);

    return res.status(201).json({
      success: true,
      message: 'Service type added successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateServiceTypeById = async (req, res, next) => {
  try {
    const data = await updateServiceType(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'Service type updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
