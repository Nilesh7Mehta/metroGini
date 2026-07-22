import {
  getVendorPayoutMasterOrdersService,
  getVendorPayoutMasterService,
  getVendorPayoutPaidService,
  getVendorPayoutPendingService,
  payVendorPayoutBatchService,
} from '../../services/admin/adminVendorPayout.service.js';
import { paginateArray } from '../../utils/pagination.util.js';

const handle = (err, res, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  return next(err);
};

export const getVendorPayoutMaster = async (req, res, next) => {
  try {
    const data = await getVendorPayoutMasterService(req.query);
    const { items: pageItems, pagination } = paginateArray(
      data.items || [],
      req.query,
    );
    return res.status(200).json({
      success: true,
      data: { ...data, items: pageItems, pagination },
    });
  } catch (err) {
    return handle(err, res, next);
  }
};

export const getVendorPayoutMasterOrders = async (req, res, next) => {
  try {
    const data = await getVendorPayoutMasterOrdersService(
      req.params.vendorId,
      req.query,
    );
    const { items: pageOrders, pagination } = paginateArray(
      data.orders || [],
      req.query,
    );
    return res.status(200).json({
      success: true,
      data: {
        ...data,
        orders: pageOrders,
        total_orders: pagination.total,
        pagination,
      },
    });
  } catch (err) {
    return handle(err, res, next);
  }
};

export const getVendorPayoutPending = async (req, res, next) => {
  try {
    const data = await getVendorPayoutPendingService(req.query);
    const { items: pageItems, pagination } = paginateArray(
      data.items || [],
      req.query,
    );
    return res.status(200).json({
      success: true,
      data: { ...data, items: pageItems, pagination },
    });
  } catch (err) {
    return handle(err, res, next);
  }
};

export const getVendorPayoutPaid = async (req, res, next) => {
  try {
    const data = await getVendorPayoutPaidService(req.query);
    const { items: pageItems, pagination } = paginateArray(
      data.items || [],
      req.query,
    );
    return res.status(200).json({
      success: true,
      data: { ...data, items: pageItems, pagination },
    });
  } catch (err) {
    return handle(err, res, next);
  }
};

export const payVendorPayoutBatch = async (req, res, next) => {
  try {
    const data = await payVendorPayoutBatchService(
      req.params.batchId,
      {
        transaction_id: req.body.transaction_id,
        date: req.body.date ?? req.body.payment_date,
      },
      req.user,
    );

    return res.status(200).json({
      success: true,
      message: 'Vendor payout marked as paid',
      data,
    });
  } catch (err) {
    return handle(err, res, next);
  }
};
