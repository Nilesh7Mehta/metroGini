import pool from '../../config/db.js';
import { ensureAutoInvoiceFile } from '../../utils/vendorPayoutInvoice.util.js';
import {
  ELIGIBLE_PAYOUT_STATUSES,
  calcGstPayable,
  formatDateLabel,
  resolveOpenPaymentStatus,
  todayStr,
  toDateStr,
  weekForDate,
} from '../../utils/vendorPayoutWeek.util.js';

const isValidDateStr = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const num = (v, digits = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return parseFloat(n.toFixed(digits));
};

const statusListSql = ELIGIBLE_PAYOUT_STATUSES.map((_, i) => `$${i + 1}`).join(', ');

/**
 * Lazy sync: bucket eligible orders into vendor×zone×week batches.
 * Paid batches are frozen. Open/pending batches are recalculated.
 */
export const syncVendorPayoutBatches = async (client = pool) => {
  const { rows: orderRows } = await client.query(
    `
    SELECT
      o.id,
      o.vendor_id,
      o.vendor_revenue,
      o.actual_weight,
      TO_CHAR(o.ready_for_delivery_at::date, 'YYYY-MM-DD') AS ready_date,
      p.pincode_group_id::int AS pincode_group_id,
      o.vendor_payout_batch_id,
      b.payment_status AS batch_payment_status
    FROM orders o
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    LEFT JOIN vendor_payout_batches b ON b.id = o.vendor_payout_batch_id
    WHERE o.vendor_id IS NOT NULL
      AND o.vendor_revenue IS NOT NULL
      AND o.ready_for_delivery_at IS NOT NULL
      AND TRIM(o.status) IN (${statusListSql})
      AND p.pincode_group_id IS NOT NULL
      AND (o.vendor_payout_batch_id IS NULL OR COALESCE(b.payment_status, '') <> 'paid')
    `,
    ELIGIBLE_PAYOUT_STATUSES,
  );

  /** @type {Map<string, { vendor_id:number, pincode_group_id:number, week_start:string, week_end:string, order_ids:number[], gross:number, kg:number }>} */
  const groups = new Map();

  for (const row of orderRows) {
    const ready = toDateStr(row.ready_date);
    if (!ready) continue;
    const week = weekForDate(`${ready}T12:00:00+05:30`);
    const key = `${row.vendor_id}|${row.pincode_group_id}|${week.week_start}`;
    if (!groups.has(key)) {
      groups.set(key, {
        vendor_id: Number(row.vendor_id),
        pincode_group_id: Number(row.pincode_group_id),
        week_start: week.week_start,
        week_end: week.week_end,
        order_ids: [],
        gross: 0,
        kg: 0,
      });
    }
    const g = groups.get(key);
    g.order_ids.push(Number(row.id));
    g.gross += Number(row.vendor_revenue) || 0;
    g.kg += Number(row.actual_weight) || 0;
  }

  for (const g of groups.values()) {
    const existing = await client.query(
      `
      SELECT id, batch_code, payment_status, invoice_id, invoice_image
      FROM vendor_payout_batches
      WHERE vendor_id = $1 AND pincode_group_id = $2 AND week_start = $3::date
      LIMIT 1
      `,
      [g.vendor_id, g.pincode_group_id, g.week_start],
    );

    if (existing.rows[0]?.payment_status === 'paid') {
      continue;
    }

    const amounts = calcGstPayable(g.gross);
    const payment_status = resolveOpenPaymentStatus(g.week_end);
    let batchId = existing.rows[0]?.id || null;
    let batchCode = existing.rows[0]?.batch_code || null;

    if (batchId) {
      await client.query(
        `
        UPDATE vendor_payout_batches
        SET week_end = $2::date,
            total_orders = $3,
            total_kg = $4,
            gross_revenue = $5,
            gst_amount = $6,
            payable_amount = $7,
            payment_status = $8,
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          batchId,
          g.week_end,
          g.order_ids.length,
          num(g.kg),
          amounts.gross_revenue,
          amounts.gst_amount,
          amounts.payable_amount,
          payment_status,
        ],
      );
    } else {
      const inserted = await client.query(
        `
        INSERT INTO vendor_payout_batches (
          batch_code, vendor_id, pincode_group_id, week_start, week_end,
          total_orders, total_kg, gross_revenue, gst_amount, payable_amount,
          payment_status
        ) VALUES (
          'tmp', $1, $2, $3::date, $4::date,
          $5, $6, $7, $8, $9,
          $10
        )
        RETURNING id
        `,
        [
          g.vendor_id,
          g.pincode_group_id,
          g.week_start,
          g.week_end,
          g.order_ids.length,
          num(g.kg),
          amounts.gross_revenue,
          amounts.gst_amount,
          amounts.payable_amount,
          payment_status,
        ],
      );
      batchId = inserted.rows[0].id;
      batchCode = `vpb-${batchId}`;
      await client.query(
        `UPDATE vendor_payout_batches SET batch_code = $2 WHERE id = $1`,
        [batchId, batchCode],
      );
    }

    // Link orders to this batch
    await client.query(
      `
      UPDATE orders
      SET vendor_payout_batch_id = $1
      WHERE id = ANY($2::int[])
      `,
      [batchId, g.order_ids],
    );

    // Auto invoice when week closed
    if (payment_status === 'pending') {
      const meta = await client.query(
        `
        SELECT
          b.id, b.batch_code, b.week_start, b.week_end,
          b.total_orders, b.total_kg, b.gross_revenue, b.gst_amount, b.payable_amount,
          b.invoice_id, b.invoice_image,
          v.laundry_shop_name AS vendor_name,
          pg.name AS zone_group
        FROM vendor_payout_batches b
        JOIN vendors v ON v.id = b.vendor_id
        JOIN pincode_groups pg ON pg.id = b.pincode_group_id
        WHERE b.id = $1
        `,
        [batchId],
      );
      const row = meta.rows[0];
      if (row && !row.invoice_image) {
        const invoice = ensureAutoInvoiceFile({
          batch_id: row.batch_code,
          invoice_id: row.invoice_id || `INV-${String(row.batch_code).toUpperCase()}`,
          vendor_name: row.vendor_name,
          zone_group: row.zone_group,
          pincode_group_name: row.zone_group,
          date_label: formatDateLabel(
            toDateStr(row.week_start),
            toDateStr(row.week_end),
          ),
          week_start: toDateStr(row.week_start),
          week_end: toDateStr(row.week_end),
          total_orders: row.total_orders,
          total_kg: num(row.total_kg),
          gross_revenue: num(row.gross_revenue),
          gst_amount: num(row.gst_amount),
          payable_amount: num(row.payable_amount),
        });
        await client.query(
          `
          UPDATE vendor_payout_batches
          SET invoice_id = $2, invoice_image = $3, updated_at = NOW()
          WHERE id = $1
          `,
          [batchId, invoice.invoice_id, invoice.invoice_image],
        );
      }
    }
  }

  // Refresh status for unpaid batches that may have no new orders this sync
  const { rows: openBatches } = await client.query(
    `
    SELECT id, batch_code, week_end, invoice_id, invoice_image,
           total_orders, total_kg, gross_revenue, gst_amount, payable_amount,
           vendor_id, pincode_group_id
    FROM vendor_payout_batches
    WHERE payment_status <> 'paid'
    `,
  );

  for (const b of openBatches) {
    const week_end = toDateStr(b.week_end);
    const payment_status = resolveOpenPaymentStatus(week_end);
    if (payment_status === 'pending' && !b.invoice_image) {
      const meta = await client.query(
        `
        SELECT v.laundry_shop_name AS vendor_name, pg.name AS zone_group,
               b.week_start, b.week_end
        FROM vendor_payout_batches b
        JOIN vendors v ON v.id = b.vendor_id
        JOIN pincode_groups pg ON pg.id = b.pincode_group_id
        WHERE b.id = $1
        `,
        [b.id],
      );
      const m = meta.rows[0];
      const invoice = ensureAutoInvoiceFile({
        batch_id: b.batch_code,
        invoice_id: b.invoice_id || `INV-${String(b.batch_code).toUpperCase()}`,
        vendor_name: m?.vendor_name,
        zone_group: m?.zone_group,
        pincode_group_name: m?.zone_group,
        date_label: formatDateLabel(toDateStr(m.week_start), toDateStr(m.week_end)),
        week_start: toDateStr(m.week_start),
        week_end: toDateStr(m.week_end),
        total_orders: b.total_orders,
        total_kg: num(b.total_kg),
        gross_revenue: num(b.gross_revenue),
        gst_amount: num(b.gst_amount),
        payable_amount: num(b.payable_amount),
      });
      await client.query(
        `
        UPDATE vendor_payout_batches
        SET payment_status = $2, invoice_id = $3, invoice_image = $4, updated_at = NOW()
        WHERE id = $1
        `,
        [b.id, payment_status, invoice.invoice_id, invoice.invoice_image],
      );
    } else {
      await client.query(
        `
        UPDATE vendor_payout_batches
        SET payment_status = $2, updated_at = NOW()
        WHERE id = $1 AND payment_status <> $2
        `,
        [b.id, payment_status],
      );
    }
  }
};

const fetchBatches = async (query = {}) => {
  const params = [];
  const where = [];

  if (query.pincode_group_id) {
    const gid = Number(query.pincode_group_id);
    if (Number.isInteger(gid) && gid > 0) {
      params.push(gid);
      where.push(`b.pincode_group_id = $${params.length}`);
    }
  }

  if (query.search) {
    const q = String(query.search).trim();
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(`LOWER(COALESCE(v.laundry_shop_name, '')) LIKE $${params.length}`);
    }
  }

  if (query.week_start) {
    params.push(query.week_start);
    where.push(`b.week_start = $${params.length}::date`);
  }

  if (query.payment_status) {
    params.push(String(query.payment_status));
    where.push(`b.payment_status = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `
    SELECT
      b.id,
      b.batch_code,
      b.vendor_id,
      COALESCE(v.laundry_shop_name, 'Vendor') AS vendor_name,
      b.pincode_group_id,
      pg.name AS zone_group,
      pg.name AS pincode_group_name,
      TO_CHAR(b.week_start, 'YYYY-MM-DD') AS week_start,
      TO_CHAR(b.week_end, 'YYYY-MM-DD') AS week_end,
      b.total_orders,
      b.total_kg,
      b.gross_revenue,
      b.gst_amount,
      b.payable_amount,
      b.payment_status,
      b.invoice_id,
      b.invoice_image,
      b.transaction_id,
      TO_CHAR(b.payment_date, 'YYYY-MM-DD') AS payment_date,
      b.paid_at
    FROM vendor_payout_batches b
    JOIN vendors v ON v.id = b.vendor_id
    JOIN pincode_groups pg ON pg.id = b.pincode_group_id
    ${whereSql}
    ORDER BY b.week_start DESC, b.id DESC
    `,
    params,
  );

  return rows.map(toPublicBatch);
};

const toPublicBatch = (batch) => {
  const week_start = toDateStr(batch.week_start);
  const week_end = toDateStr(batch.week_end);
  const payment_status =
    batch.payment_status === 'paid'
      ? 'paid'
      : resolveOpenPaymentStatus(week_end);

  const base = {
    batch_id: batch.batch_code,
    vendor_id: Number(batch.vendor_id),
    vendor_name: batch.vendor_name,
    pincode_group_id: Number(batch.pincode_group_id),
    zone_group: batch.zone_group,
    pincode_group_name: batch.pincode_group_name,
    date_from: week_start,
    date_to: week_end,
    date_label: formatDateLabel(week_start, week_end),
    total_orders: Number(batch.total_orders) || 0,
    total_kg: num(batch.total_kg),
    total_weight: num(batch.total_kg),
    gross_revenue: num(batch.gross_revenue),
    total_amount: num(batch.gross_revenue),
    gst_amount: num(batch.gst_amount, 0),
    payable_amount: num(batch.payable_amount),
    payment_status,
  };

  if (payment_status === 'pending' || payment_status === 'paid') {
    base.invoice_id =
      batch.invoice_id || `INV-${String(batch.batch_code).toUpperCase()}`;
    base.invoice_image =
      batch.invoice_image ||
      `/uploads/vendor-payout-invoices/auto-${batch.batch_code}.pdf`;
  }

  if (payment_status === 'paid') {
    return {
      ...base,
      transaction_id: batch.transaction_id || null,
      payment_date: toDateStr(batch.payment_date) || null,
      paid_at: batch.paid_at || null,
    };
  }

  return base;
};

export const getVendorPayoutMasterService = async (query = {}) => {
  await syncVendorPayoutBatches();
  const rows = await fetchBatches(query);

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
    agg.total_kg = num(agg.total_kg + row.total_kg);
    agg.total_weight = num(agg.total_weight + row.total_weight);
    agg.total_orders += row.total_orders;

    if (row.payment_status === 'paid') {
      agg.paid_amount += row.payable_amount;
    } else if (row.payment_status === 'pending') {
      agg.pending_amount += row.payable_amount;
    }
  }

  const items = [...byVendor.values()].map((item) => ({
    ...item,
    total_revenue: Math.round(item.total_revenue),
    paid_amount: Math.round(item.paid_amount),
    pending_amount: Math.round(item.pending_amount),
    view_orders_url: `/api/admin/vendor-payout/master/${item.vendor_id}/orders?pincode_group_id=${item.pincode_group_id}`,
  }));

  return {
    mode: 'live',
    summary: {
      total_revenue: items.reduce((s, i) => s + i.total_revenue, 0),
      total_orders: items.reduce((s, i) => s + i.total_orders, 0),
      total_weight: num(items.reduce((s, i) => s + i.total_weight, 0)),
      paid_amount: items.reduce((s, i) => s + i.paid_amount, 0),
      pending_amount: items.reduce((s, i) => s + i.pending_amount, 0),
    },
    items,
  };
};

export const getVendorPayoutMasterOrdersService = async (vendorId, query = {}) => {
  await syncVendorPayoutBatches();

  const id = Number(vendorId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'Invalid vendor id' };
  }

  const vendorRes = await pool.query(
    `SELECT id, laundry_shop_name FROM vendors WHERE id = $1`,
    [id],
  );
  if (!vendorRes.rows.length) {
    throw { status: 404, message: 'Vendor not found' };
  }

  const params = [id, ...ELIGIBLE_PAYOUT_STATUSES];
  const where = [
    `o.vendor_id = $1`,
    `o.vendor_revenue IS NOT NULL`,
    `o.ready_for_delivery_at IS NOT NULL`,
    `TRIM(o.status) IN (${ELIGIBLE_PAYOUT_STATUSES.map((_, i) => `$${i + 2}`).join(', ')})`,
  ];

  if (query.pincode_group_id) {
    const gid = Number(query.pincode_group_id);
    if (Number.isInteger(gid) && gid > 0) {
      params.push(gid);
      where.push(`p.pincode_group_id = $${params.length}`);
    }
  }

  if (query.week_start) {
    params.push(query.week_start);
    where.push(`b.week_start = $${params.length}::date`);
  }

  if (query.payout_status) {
    params.push(String(query.payout_status).toLowerCase());
    where.push(`COALESCE(b.payment_status, 'invoice_not_generated') = $${params.length}`);
  }

  const { rows } = await pool.query(
    `
    SELECT
      o.id,
      COALESCE(o.order_code, CONCAT('ORD-', o.id)) AS order_code,
      TO_CHAR(o.ready_for_delivery_at::date, 'YYYY-MM-DD') AS ready_date,
      TO_CHAR(b.week_start, 'YYYY-MM-DD') AS week_start,
      TO_CHAR(b.week_end, 'YYYY-MM-DD') AS week_end,
      COALESCE(st.name, 'Service') AS service_type,
      o.actual_weight,
      o.final_total,
      o.vendor_revenue,
      o.vendor_amount_per_kg,
      TRIM(o.status) AS status,
      b.payment_status,
      b.batch_code,
      p.pincode_group_id::int AS pincode_group_id,
      pg.name AS zone_group
    FROM orders o
    LEFT JOIN service_types st ON st.id = o.service_type_id
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    LEFT JOIN vendor_payout_batches b ON b.id = o.vendor_payout_batch_id
    LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
    WHERE ${where.join(' AND ')}
    ORDER BY o.ready_for_delivery_at DESC NULLS LAST, o.id DESC
    `,
    params,
  );

  let zone =
    rows.find((r) => r.pincode_group_id)?.pincode_group_id != null
      ? {
          pincode_group_id: Number(
            rows.find((r) => r.pincode_group_id).pincode_group_id,
          ),
          zone_group: rows.find((r) => r.zone_group)?.zone_group || null,
        }
      : { pincode_group_id: null, zone_group: null };

  if (query.pincode_group_id) {
    const gid = Number(query.pincode_group_id);
    const pg = await pool.query(`SELECT id, name FROM pincode_groups WHERE id = $1`, [
      gid,
    ]);
    if (pg.rows[0]) {
      zone = {
        pincode_group_id: Number(pg.rows[0].id),
        zone_group: pg.rows[0].name,
      };
    }
  }

  const orders = rows.map((o) => {
    const ready = toDateStr(o.ready_date);
    const week = o.week_start
      ? { week_start: toDateStr(o.week_start), week_end: toDateStr(o.week_end) }
      : weekForDate(`${ready}T12:00:00+05:30`);

    let payout_status = o.payment_status || null;
    if (!payout_status) {
      payout_status = resolveOpenPaymentStatus(week.week_end);
    } else if (payout_status !== 'paid') {
      payout_status = resolveOpenPaymentStatus(week.week_end);
    }

    return {
      id: String(o.id),
      order_id: o.order_code,
      date: ready,
      date_from: week.week_start,
      date_to: week.week_end,
      service_type: o.service_type,
      weight_kg: num(o.actual_weight),
      order_amount: num(o.final_total),
      vendor_revenue: num(o.vendor_revenue),
      vendor_amount_per_kg:
        o.vendor_amount_per_kg != null ? num(o.vendor_amount_per_kg) : null,
      status: o.status,
      payout_status,
      batch_id: o.batch_code || null,
    };
  });

  return {
    mode: 'live',
    vendor: {
      vendor_id: id,
      vendor_name: vendorRes.rows[0].laundry_shop_name || 'Vendor',
      pincode_group_id: zone.pincode_group_id,
      zone_group: zone.zone_group,
      pincode_group_name: zone.zone_group,
    },
    total_orders: orders.length,
    orders,
  };
};

export const getVendorPayoutPendingService = async (query = {}) => {
  await syncVendorPayoutBatches();

  const STATUS_PRIORITY = {
    pending: 0,
    invoice_not_generated: 1,
  };

  const items = (await fetchBatches(query))
    .filter((row) =>
      ['invoice_not_generated', 'pending'].includes(row.payment_status),
    )
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.payment_status] ?? 99;
      const pb = STATUS_PRIORITY[b.payment_status] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.date_from.localeCompare(b.date_from);
    });

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
    mode: 'live',
    tickers,
    items,
  };
};

export const getVendorPayoutPaidService = async (query = {}) => {
  await syncVendorPayoutBatches();
  const items = (await fetchBatches({ ...query, payment_status: 'paid' })).sort(
    (a, b) => String(b.paid_at || '').localeCompare(String(a.paid_at || '')),
  );

  return {
    mode: 'live',
    items,
  };
};

export const payVendorPayoutBatchService = async (batchId, payload, adminUser) => {
  await syncVendorPayoutBatches();

  const code = String(batchId || '').trim();
  const found = await pool.query(
    `
    SELECT
      b.*,
      COALESCE(v.laundry_shop_name, 'Vendor') AS vendor_name,
      pg.name AS zone_group,
      pg.name AS pincode_group_name,
      TO_CHAR(b.week_start, 'YYYY-MM-DD') AS week_start_str,
      TO_CHAR(b.week_end, 'YYYY-MM-DD') AS week_end_str
    FROM vendor_payout_batches b
    JOIN vendors v ON v.id = b.vendor_id
    JOIN pincode_groups pg ON pg.id = b.pincode_group_id
    WHERE b.batch_code = $1
    LIMIT 1
    `,
    [code],
  );

  if (!found.rows.length) {
    throw { status: 404, message: 'Payout batch not found' };
  }

  const batch = found.rows[0];
  const week_end = toDateStr(batch.week_end_str || batch.week_end);
  const status =
    batch.payment_status === 'paid'
      ? 'paid'
      : resolveOpenPaymentStatus(week_end);

  if (status === 'invoice_not_generated') {
    throw {
      status: 400,
      message:
        'Invoice not generated yet. Payment is allowed only after the report week has ended.',
    };
  }

  if (status === 'paid' || batch.payment_status === 'paid') {
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
    throw { status: 400, message: 'date is required (YYYY-MM-DD)' };
  }

  const invoice = ensureAutoInvoiceFile({
    batch_id: batch.batch_code,
    invoice_id: batch.invoice_id || `INV-${String(batch.batch_code).toUpperCase()}`,
    vendor_name: batch.vendor_name,
    zone_group: batch.zone_group,
    pincode_group_name: batch.pincode_group_name,
    date_label: formatDateLabel(
      toDateStr(batch.week_start_str || batch.week_start),
      week_end,
    ),
    week_start: toDateStr(batch.week_start_str || batch.week_start),
    week_end,
    total_orders: batch.total_orders,
    total_kg: num(batch.total_kg),
    gross_revenue: num(batch.gross_revenue),
    gst_amount: num(batch.gst_amount),
    payable_amount: num(batch.payable_amount),
  });

  const paid_at = `${payment_date}T12:00:00.000Z`;

  await pool.query(
    `
    UPDATE vendor_payout_batches
    SET payment_status = 'paid',
        transaction_id = $2,
        payment_date = $3::date,
        paid_at = $4::timestamptz,
        paid_by = $5,
        invoice_id = $6,
        invoice_image = $7,
        updated_at = NOW()
    WHERE id = $1
    `,
    [
      batch.id,
      transaction_id,
      payment_date,
      paid_at,
      adminUser?.id || null,
      invoice.invoice_id,
      invoice.invoice_image,
    ],
  );

  const refreshed = await fetchBatches({ week_start: toDateStr(batch.week_start_str) });
  const paidRow = refreshed.find((r) => r.batch_id === code);
  if (paidRow) return paidRow;

  return toPublicBatch({
    ...batch,
    payment_status: 'paid',
    transaction_id,
    payment_date,
    paid_at,
    invoice_id: invoice.invoice_id,
    invoice_image: invoice.invoice_image,
    week_start: batch.week_start_str,
    week_end: batch.week_end_str,
  });
};
