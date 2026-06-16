import { createService, updateService } from '../../services/admin/adminService.service.js';

const handleError = (res, err, next) => {
  if (err.code === '23505') {
    return res.status(400).json({
      success: false,
      message: 'Service name already exists',
    });
  }
  if (err.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

export const addService = async (req, res, next) => {
  try {
    const data = await createService(req.body, req.file?.path);

    return res.status(201).json({
      success: true,
      message: 'Service added successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateServiceById = async (req, res, next) => {
  try {
    const data = await updateService(req.params.id, req.body, req.file?.path);

    return res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
