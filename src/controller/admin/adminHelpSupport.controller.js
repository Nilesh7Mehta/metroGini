import { getAdminHelpSupportService } from '../../services/admin/adminHelpSupport.service.js';

export const getAdminHelpSupport = async (req, res, next) => {
  try {
    const data = await getAdminHelpSupportService(req.query);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
