import { getAdminPartnerLeadsService } from '../../services/admin/adminPartnerLead.service.js';

export const getAdminPartnerLeads = async (req, res, next) => {
  try {
    const data = await getAdminPartnerLeadsService(req.query);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
