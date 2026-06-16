import { getAdminMarketingService } from '../../services/admin/adminMarketing.service.js';

export const getAdminMarketing = async (req, res, next) => {
  try {
    const data = await getAdminMarketingService(req.query);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
