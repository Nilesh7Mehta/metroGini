import { getAdminPaymentsService } from '../../services/admin/adminPayment.service.js';

export const getAdminPayments = async (req, res, next) => {
  try {
    const data = await getAdminPaymentsService(req.query);

    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};
