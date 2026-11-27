import {
  getAdminReferralDetailService,
  listAdminReferralsService,
} from "../../services/admin/adminReferral.service.js";

export const listAdminReferrals = async (req, res, next) => {
  try {
    const data = await listAdminReferralsService(req.query);
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

export const getAdminReferralDetail = async (req, res, next) => {
  try {
    const data = await getAdminReferralDetailService(req.params.userId, req.query);
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
