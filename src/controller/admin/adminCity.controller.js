import { createCity, updateCity } from '../../services/admin/adminCity.service.js';

const handleError = (res, err, next) => {
  if (err.code === '23505') {
    return res.status(400).json({
      success: false,
      message: 'city_name already exists',
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

export const addCity = async (req, res, next) => {
  try {
    const data = await createCity(req.body, req.file?.path);

    return res.status(201).json({
      success: true,
      message: 'City added successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateCityById = async (req, res, next) => {
  try {
    const data = await updateCity(req.params.id, req.body, req.file?.path);

    return res.status(200).json({
      success: true,
      message: 'City updated successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
