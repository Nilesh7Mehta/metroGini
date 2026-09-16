import {
  listAdminUsersService,
  createAdminUserService,
  updateAdminUserService,
  deleteAdminUserService,
} from '../../services/admin/adminUser.service.js';

const respondUniqueViolation = (res, err) => {
  const constraint = String(err.constraint || err.index || '');
  const detail = String(err.detail || '').toLowerCase();

  if (
    constraint.includes('mobile') ||
    detail.includes('(mobile)') ||
    detail.includes('mobile=')
  ) {
    return res.status(409).json({
      success: false,
      message: 'Admin mobile already exists',
    });
  }

  return res.status(409).json({
    success: false,
    message: 'Admin email already exists',
  });
};

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
      return respondUniqueViolation(res, err);
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
      return respondUniqueViolation(res, err);
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
