import { getAdminDashboardService } from '../../services/admin/adminDashboard.service.js';

export const getAdminDashboard = async (req, res, next) => {
  try {
    const data = await getAdminDashboardService(req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};
