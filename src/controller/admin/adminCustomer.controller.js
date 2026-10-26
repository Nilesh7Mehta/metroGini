import {
  getAdminCustomerDetailsService,
  getAdminCustomerOrdersService,
} from '../../services/admin/adminCustomer.service.js';

const handleError = (res, err, next) => {
  if (err.status) {
    return res
      .status(err.status)
      .json({ success: false, message: err.message });
  }
  next(err);
};

export const getAdminCustomerDetails = async (req, res, next) => {
  try {
    const data = await getAdminCustomerDetailsService(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Customer details fetched successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getAdminCustomerOrders = async (req, res, next) => {
  try {
    const data = await getAdminCustomerOrdersService(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Customer orders fetched successfully',
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
