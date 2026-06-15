import { getAdminIssuesService } from '../../services/admin/adminIssue.service.js';

export const getAdminIssues = async (req, res, next) => {
  try {
    const data = await getAdminIssuesService(req.query);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
