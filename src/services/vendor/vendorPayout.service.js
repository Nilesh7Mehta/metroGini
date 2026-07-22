import {
  getVendorPayoutPaidService,
  getVendorPayoutPendingService,
} from '../admin/adminVendorPayout.service.js';
import { paginateArray } from '../../utils/pagination.util.js';

const sumPayable = (items = []) =>
  Math.round(
    items.reduce((sum, row) => sum + Number(row.payable_amount || 0), 0),
  );

const sumOrders = (items = []) =>
  items.reduce((sum, row) => sum + (Number(row.total_orders) || 0), 0);

/** Vendor-facing batch row (matches mobile/web payout UI). */
const toVendorBatch = (row) => {
  const base = {
    batch_id: row.batch_id,
    vendor_id: row.vendor_id,
    zone_group: row.zone_group,
    pincode_group_name: row.pincode_group_name,
    date_from: row.date_from,
    date_to: row.date_to,
    date_label: row.date_label,
    total_orders: row.total_orders,
    total_kg: row.total_kg,
    total_weight: row.total_weight ?? row.total_kg,
    gross_revenue: row.gross_revenue,
    gst_amount: row.gst_amount,
    payable_amount: row.payable_amount,
    payment_status: row.payment_status,
  };

  if (row.invoice_id) base.invoice_id = row.invoice_id;
  if (row.invoice_image) base.invoice_image = row.invoice_image;

  if (row.payment_status === 'paid') {
    base.transaction_id = row.transaction_id || null;
    base.payment_date = row.payment_date || null;
    base.paid_at = row.paid_at || null;
  }

  return base;
};

/**
 * GET /api/vendor/payout
 * Optional query: week_start (YYYY-MM-DD), pincode_group_id, page, limit
 */
export const getMyVendorPayoutService = async (vendorId, query = {}) => {
  const vendor_id = Number(vendorId);
  if (!Number.isInteger(vendor_id) || vendor_id <= 0) {
    throw { status: 401, message: 'Unauthorized' };
  }

  const scoped = {
    vendor_id,
    week_start: query.week_start || undefined,
    pincode_group_id: query.pincode_group_id || undefined,
  };

  const [pendingData, paidData] = await Promise.all([
    getVendorPayoutPendingService(scoped),
    getVendorPayoutPaidService(scoped),
  ]);

  const pendingRaw = pendingData.items ?? [];
  const paidRaw = paidData.items ?? [];

  const pendingOnly = pendingRaw.filter(
    (row) => row.payment_status === 'pending',
  );
  const openWeek = pendingRaw.filter(
    (row) => row.payment_status === 'invoice_not_generated',
  );

  const pendingAll = [...pendingOnly, ...openWeek].map(toVendorBatch);
  const paidAll = paidRaw.map(toVendorBatch);

  const pendingPage = paginateArray(pendingAll, query);
  const paidPage = paginateArray(paidAll, query);

  return {
    mode: 'live',
    summary: {
      pending_amount: sumPayable(pendingOnly),
      paid_amount: sumPayable(paidRaw),
      pending_batches: pendingOnly.length,
      paid_batches: paidRaw.length,
      pending_orders: sumOrders(pendingOnly),
      paid_orders: sumOrders(paidRaw),
    },
    tickers: pendingData.tickers ?? [],
    pending: pendingPage.items,
    paid: paidPage.items,
    pagination: {
      pending: pendingPage.pagination,
      paid: paidPage.pagination,
    },
  };
};
