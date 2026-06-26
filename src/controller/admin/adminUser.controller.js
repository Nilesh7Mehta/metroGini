import {
  listAdminUsersService,
  createAdminUserService,
  updateAdminUserService,
  deleteAdminUserService,
} from '../../services/admin/adminUser.service.js';

export const listAdminUsers = async (req, res, next) => {
  try {
    const data = await listAdminUsersService();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const createAdminUser = async (req, res, next) => {
  try {
    const data = await createAdminUserService(req.body);
    return res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Email or mobile already exists',
      });
    }
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const updateAdminUser = async (req, res, next) => {
  try {
    const data = await updateAdminUserService(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: 'Admin user updated successfully',
      data,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Email already exists',
      });
    }
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

export const deleteAdminUser = async (req, res, next) => {
  try {
    await deleteAdminUserService(req.params.id, req.user.id);
    return res.status(200).json({
      success: true,
      message: 'Admin user deleted successfully',
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
