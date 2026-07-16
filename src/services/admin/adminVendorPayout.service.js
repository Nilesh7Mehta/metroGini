import { buildDummyPayoutSeed } from '../../data/vendorPayout.dummy.js';
import {
  ensureAutoInvoiceFile,
  ensureInvoiceFileFromPath,
} from '../../utils/vendorPayoutInvoice.util.js';

/** In-memory pay overrides for Phase 1 (resets on server restart). */
const paidOverrides = new Map();

const todayStr = () => new Date().toLocaleDateString('en-CA');

const isValidDateStr = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

/** Auto invoice once week closes (pending / paid). Writes PDF to uploads/. */
const buildAutoInvoice = (batch) => {
  if (batch.invoice_image) {
    ensureInvoiceFileFromPath(batch.invoice_image, [
      'Metro Gini — Vendor Payout Invoice',
      `Invoice ID: ${batch.invoice_id || `INV-${String(batch.batch_id).toUpperCase()}`}`,
      `Batch ID: ${batch.batch_id}`,
      `Vendor: ${batch.vendor_name || '-'}`,
      `Period: ${batch.date_label || `${batch.week_start} - ${batch.week_end}`}`,
      `Payable: ${batch.payable_amount ?? '-'}`,
    ]);
    return {
      invoice_id:
        batch.invoice_id || `INV-${String(batch.batch_id).toUpperCase()}`,
      invoice_image: batch.invoice_image,
    };
  }

  const { invoice_id, invoice_image } = ensureAutoInvoiceFile(batch);
  return { invoice_id, invoice_image };
};

const resolvePaymentStatus = (batch) => {
  const override = paidOverrides.get(batch.batch_id);
  if (override || batch.seed_paid) return 'paid';

  const today = todayStr();
  if (today <= batch.week_end) return 'invoice_not_generated';
  return 'pending';
};

const toPublicBatch = (batch) => {
  const payment_status = resolvePaymentStatus(batch);
  const override = paidOverrides.get(batch.batch_id);

  const base = {
    batch_id: batch.batch_id,
    vendor_id: batch.vendor_id,
    vendor_name: batch.vendor_name,
    pincode_group_id: batch.pincode_group_id,
    zone_group: batch.zone_group,
    pincode_group_name: batch.pincode_group_name,
    date_from: batch.week_start,
    date_to: batch.week_end,
    date_label: batch.date_label,
    total_orders: batch.total_orders,
    total_kg: batch.total_kg,
    total_weight: batch.total_weight,
    gross_revenue: batch.gross_revenue,
    total_amount: batch.gross_revenue,
    gst_amount: batch.gst_amount,
    payable_amount: batch.payable_amount,
    payment_status,
  };

  // Invoice auto-generated after week ends (pending + paid)
  if (payment_status === 'pending' || payment_status === 'paid') {
    Object.assign(base, buildAutoInvoice(batch));
  }

  if (payment_status === 'paid') {
    const payment_date =
      override?.payment_date ||
      batch.payment_date ||
      (batch.paid_at ? String(batch.paid_at).slice(0, 10) : null);

    return {
      ...base,
      invoice_id: override?.invoice_id || base.invoice_id,
      invoice_image: override?.invoice_image || base.invoice_image,
      transaction_id: override?.transaction_id || batch.transaction_id || null,
      payment_date,
      paid_at: override?.paid_at || batch.paid_at || null,
    };
  }

  return base;
};

const getAllBatches = () => {
  const { batches } = buildDummyPayoutSeed();
  return batches.map(toPublicBatch);
};

const matchesFilters = (row, query = {}) => {
  if (query.pincode_group_id) {
    const gid = Number(query.pincode_group_id);
    if (Number.isInteger(gid) && gid > 0 && row.pincode_group_id !== gid) {
      return false;
    }
  }

  if (query.search) {
    const q = String(query.search).trim().toLowerCase();
    if (q && !row.vendor_name.toLowerCase().includes(q)) return false;
  }

  if (query.week_start && row.date_from !== query.week_start) return false;

  return true;
};

export const getVendorPayoutMasterService = async (query = {}) => {
  const rows = getAllBatches().filter((row) => matchesFilters(row, query));

  const byVendor = new Map();

  for (const row of rows) {
    const key = `${row.vendor_id}:${row.pincode_group_id}`;
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        pincode_group_id: row.pincode_group_id,
        zone_group: row.zone_group,
        pincode_group_name: row.pincode_group_name,
        total_revenue: 0,
        total_kg: 0,
        total_weight: 0,
        total_orders: 0,
        paid_amount: 0,
        pending_amount: 0,
      });
    }

    const agg = byVendor.get(key);
    agg.total_revenue += row.gross_revenue;
    agg.total_kg = parseFloat((agg.total_kg + row.total_kg).toFixed(2));
    agg.total_weight = parseFloat((agg.total_weight + row.total_weight).toFixed(2));
    agg.total_orders += row.total_orders;

    if (row.payment_status === 'paid') {
      agg.paid_amount += row.payable_amount;
    } else if (row.payment_status === 'pending') {
      agg.pending_amount += row.payable_amount;
    }
    // invoice_not_generated: not yet payable — still count toward totals above
  }

  const items = [...byVendor.values()].map((item) => ({
    ...item,
    total_revenue: Math.round(item.total_revenue),
    paid_amount: Math.round(item.paid_amount),
    pending_amount: Math.round(item.pending_amount),
    // UI: Master → View Orders
    view_orders_url: `/api/admin/vendor-payout/master/${item.vendor_id}/orders?pincode_group_id=${item.pincode_group_id}`,
  }));

  return {
    mode: 'dummy',
    summary: {
      total_revenue: items.reduce((s, i) => s + i.total_revenue, 0),
      total_orders: items.reduce((s, i) => s + i.total_orders, 0),
      total_weight: parseFloat(
        items.reduce((s, i) => s + i.total_weight, 0).toFixed(2),
      ),
      paid_amount: items.reduce((s, i) => s + i.paid_amount, 0),
      pending_amount: items.reduce((s, i) => s + i.pending_amount, 0),
    },
    items,
  };
};

export const getVendorPayoutMasterOrdersService = async (vendorId, query = {}) => {
  const id = Number(vendorId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'Invalid vendor id' };
  }

  const { batches, orders } = buildDummyPayoutSeed();
  const vendorBatch = batches.find((b) => Number(b.vendor_id) === id);
  if (!vendorBatch) {
    throw { status: 404, message: 'Vendor not found in payout data' };
  }

  let list = orders.filter((o) => Number(o.vendor_id) === id);

  if (query.pincode_group_id) {
    const gid = Number(query.pincode_group_id);
    if (Number.isInteger(gid) && gid > 0) {
      list = list.filter((o) => Number(o.pincode_group_id) === gid);
    }
  }

  if (query.week_start) {
    list = list.filter((o) => o.week_start === query.week_start);
  }

  if (query.payout_status) {
    const status = String(query.payout_status).toLowerCase();
    list = list.filter((o) => o.payout_status === status);
  }

  list = [...list].sort((a, b) => b.date.localeCompare(a.date));

  const zoneRow =
    batches.find(
      (b) =>
        Number(b.vendor_id) === id &&
        (!query.pincode_group_id ||
          Number(b.pincode_group_id) === Number(query.pincode_group_id)),
    ) || vendorBatch;

  return {
    mode: 'dummy',
    vendor: {
      vendor_id: id,
      vendor_name: zoneRow.vendor_name,
      pincode_group_id: zoneRow.pincode_group_id,
      zone_group: zoneRow.zone_group,
      pincode_group_name: zoneRow.pincode_group_name,
    },
    total_orders: list.length,
    orders: list.map((o) => ({
      id: o.id,
      order_id: o.order_id,
      date: o.date,
      date_from: o.week_start,
      date_to: o.week_end,
      service_type: o.service_type,
      weight_kg: o.weight_kg,
      order_amount: o.order_amount,
      vendor_revenue: o.vendor_revenue,
      vendor_amount_per_kg: o.vendor_amount_per_kg,
      status: o.status,
      payout_status: o.payout_status,
    })),
  };
};

export const getVendorPayoutPendingService = async (query = {}) => {
  // Pay-ready rows first; invoice_not_generated always at the bottom
  const STATUS_PRIORITY = {
    pending: 0,
    invoice_not_generated: 1,
  };

  const items = getAllBatches()
    .filter((row) =>
      ['invoice_not_generated', 'pending'].includes(row.payment_status),
    )
    .filter((row) => matchesFilters(row, query))
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.payment_status] ?? 99;
      const pb = STATUS_PRIORITY[b.payment_status] ?? 99;
      if (pa !== pb) return pa - pb;
      // Within same status: oldest week first (clear payment backlog first)
      return a.date_from.localeCompare(b.date_from);
    });

  // Tickers: one per closed week range where payment is still pending
  const pendingOnly = items.filter((row) => row.payment_status === 'pending');
  const rangeMap = new Map();

  for (const row of pendingOnly) {
    const key = `${row.date_from}|${row.date_to}`;
    if (!rangeMap.has(key)) {
      rangeMap.set(key, {
        date_from: row.date_from,
        date_to: row.date_to,
        date_label: row.date_label,
        batch_count: 0,
        total_payable: 0,
      });
    }
    const agg = rangeMap.get(key);
    agg.batch_count += 1;
    agg.total_payable += row.payable_amount;
  }

  const tickers = [...rangeMap.values()]
    .sort((a, b) => a.date_from.localeCompare(b.date_from))
    .map((range) => ({
      key: 'range_payment_pending',
      message: `Payment pending for ${range.date_label}`,
      date_from: range.date_from,
      date_to: range.date_to,
      date_label: range.date_label,
      batch_count: range.batch_count,
      total_payable: Math.round(range.total_payable),
    }));

  return {
    mode: 'dummy',
    tickers,
    items,
  };
};

export const getVendorPayoutPaidService = async (query = {}) => {
  const items = getAllBatches()
    .filter((row) => row.payment_status === 'paid')
    .filter((row) => matchesFilters(row, query))
    .sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));

  return {
    mode: 'dummy',
    items,
  };
};

export const payVendorPayoutBatchService = async (batchId, payload, adminUser) => {
  const id = String(batchId || '').trim();
  const { batches } = buildDummyPayoutSeed();
  const batch = batches.find((b) => b.batch_id === id);

  if (!batch) {
    throw { status: 404, message: 'Payout batch not found' };
  }

  const status = resolvePaymentStatus(batch);

  if (status === 'invoice_not_generated') {
    throw {
      status: 400,
      message:
        'Invoice not generated yet. Payment is allowed only after the report week has ended.',
    };
  }

  if (status === 'paid') {
    throw { status: 400, message: 'This payout batch is already paid' };
  }

  const transaction_id = payload.transaction_id
    ? String(payload.transaction_id).trim()
    : '';
  if (!transaction_id) {
    throw { status: 400, message: 'transaction_id is required' };
  }

  const payment_date = payload.date
    ? String(payload.date).trim()
    : payload.payment_date
      ? String(payload.payment_date).trim()
      : '';
  if (!payment_date || !isValidDateStr(payment_date)) {
    throw {
      status: 400,
      message: 'date is required (YYYY-MM-DD)',
    };
  }

  // Invoice is system-generated when week closes — not uploaded on pay
  const auto = buildAutoInvoice(batch);
  const paid_at = `${payment_date}T12:00:00.000Z`;

  paidOverrides.set(id, {
    transaction_id,
    payment_date,
    invoice_id: auto.invoice_id,
    invoice_image: auto.invoice_image,
    paid_at,
    paid_by: adminUser?.id || null,
  });

  return toPublicBatch(batch);
};
