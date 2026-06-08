import { getAdminDashboardService } from '../../services/admin/adminDashboard.service.js';

export const getAdminDashboard = async (req, res, next) => {
  try {
    const period = req.query.period || 'today';
    const data = await getAdminDashboardService(period);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
