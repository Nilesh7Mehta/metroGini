import { getAdminCustomerDetailsService } from '../../services/admin/adminCustomer.service.js';

export const getAdminCustomerDetails = async (req, res, next) => {
  try {
    const data = await getAdminCustomerDetailsService(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Customer details fetched successfully',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    }
    next(err);
  }
};
