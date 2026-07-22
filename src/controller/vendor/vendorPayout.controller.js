import { getMyVendorPayoutService } from '../../services/vendor/vendorPayout.service.js';

const handle = (err, res, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
};

/** GET /api/vendor/payout */
export const getMyPayout = async (req, res, next) => {
  try {
    const data = await getMyVendorPayoutService(req.user.vendor_id, req.query);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return handle(err, res, next);
  }
};
