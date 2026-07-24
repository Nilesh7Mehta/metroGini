import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import { paginateArray } from '../../utils/pagination.util.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_PAYMENT_STATUSES = [
  'paid',
  'partially_paid',
  'pending',
  'failed',
  'refunded',
];
const GST_RATE = 0.18;

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
};

const formatDate = (date) => date.toLocaleDateString('en-CA');

const getDateRange = (period) => {
  const now = new Date();

  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: formatDate(monday), end: formatDate(sunday) };
  }

  if (period === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(firstDay), end: formatDate(lastDay) };
  }

  const today = formatDate(now);
  return { start: today, end: today };
};

const parseOptionalPincodeGroupId = (value) => {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'zone_id / pincode_group_id must be a positive integer' };
  }
  return id;
};

const resolveZoneFilter = async (query = {}) => {
  const zoneId = parseOptionalPincodeGroupId(
    query.zone_id ?? query.pincode_group_id,
  );
  const zoneCodeRaw = query.zone_code;
  const zoneCode =
    zoneCodeRaw != null && String(zoneCodeRaw).trim() !== ''
      ? String(zoneCodeRaw).trim()
      : null;

  if (zoneId == null && zoneCode == null) {
    return {
      pincode_group_id: null,
      zone_id: null,
      zone_code: null,
      zone_name: null,
    };
  }

  let rows;
  if (zoneId != null) {
    ({ rows } = await sql.query(
      `SELECT id, group_code, name FROM pincode_groups WHERE id = $1`,
      [zoneId],
    ));
    if (!rows.length) {
      throw { status: 404, message: 'zone_id not found' };
    }
  } else {
    ({ rows } = await sql.query(
      `SELECT id, group_code, name FROM pincode_groups WHERE group_code = $1`,
      [zoneCode],
    ));
    if (!rows.length) {
      throw { status: 404, message: 'zone_code not found' };
    }
  }

  const row = rows[0];
  return {
    pincode_group_id: Number(row.id),
    zone_id: Number(row.id),
    zone_code: row.group_code || null,
    zone_name: row.name || null,
  };
};

const resolveFilters = (query = {}) => {
  const dateFrom = query.date_from;
  const dateTo = query.date_to;

  if (
    dateFrom &&
    dateTo &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateTo)
  ) {
    return {
      start: dateFrom,
      end: dateTo,
      period: VALID_PERIODS.includes(query.period) ? query.period : 'custom',
      paymentStatus: query.payment_status || null,
      method: query.method || null,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    paymentStatus: query.payment_status || null,
    method: query.method || null,
  };
};

const formatDateLabel = (start, end) => {
  const labelOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  const startDate = new Date(`${start}T12:00:00`);

  if (start === end) {
    return startDate.toLocaleDateString('en-GB', labelOptions);
  }

  const endDate = new Date(`${end}T12:00:00`);
  const startPart = startDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const endPart = endDate.toLocaleDateString('en-GB', labelOptions);
  return `${startPart} - ${endPart}`;
};

const isExpressOrder = (serviceTypeName) =>
  typeof serviceTypeName === 'string' &&
  serviceTypeName.toLowerCase().includes('express');

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatOrderId = (order) =>
  order.order_code || `ORD-${String(order.id).padStart(3, '0')}`;

const normalizeMethod = (method) => {
  if (!method) return null;
  return String(method).trim().toLowerCase().replace(/\s+/g, '_');
};

const formatPaymentDate = (paidAt) => {
  if (!paidAt) return null;
  const date = new Date(paidAt);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getOrderAmount = (order) =>
  Math.round(Number(order.final_total ?? order.estimated_total ?? 0));

const getAdvanceAmount = (order) =>
  Math.round(Number(order.advance_amount || 0));

const splitGrossNetGst = (grossAmount) => {
  const gross = Math.round(Number(grossAmount || 0));
  const gst = Math.round((gross * GST_RATE) / (1 + GST_RATE));
  return {
    gross_revenue: gross,
    gst_18: gst,
    net_revenue: gross - gst,
  };
};

const matchesPaymentStatusFilter = (order, paymentStatus) => {
  if (!paymentStatus) return true;
  return String(order.payment_status || 'pending').toLowerCase() === paymentStatus;
};

const fetchOrders = async (start, end, pickupShiftSlotIds, method, pincodeGroupId) => {
  const params = [start, end, pickupShiftSlotIds, pincodeGroupId];
  let methodClause = '';

  if (method) {
    params.push(normalizeMethod(method));
    methodClause = `
      AND EXISTS (
        SELECT 1
        FROM payments p
        WHERE p.order_id = o.id
          AND LOWER(REPLACE(COALESCE(p.payment_method, ''), ' ', '_')) = $${params.length}
      )
    `;
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.service_id,
      o.payment_status,
      o.pickup_slot_id,
      o.pickup_date,
      o.final_total,
      o.estimated_total,
      o.payment_completed_at,
      st.name AS service_type_name,
      lp.payment_method AS latest_payment_method,
      lp.paid_at AS latest_paid_at,
      COALESCE(ap.advance_amount, 0) AS advance_amount,
      pg.id AS zone_id,
      pg.group_code AS zone_code,
      pg.name AS zone_name
    FROM orders o
    LEFT JOIN service_types st ON st.id = o.service_type_id
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
    LEFT JOIN LATERAL (
      SELECT payment_method, paid_at
      FROM payments
      WHERE order_id = o.id
        AND status = 'success'
      ORDER BY paid_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) lp ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0) AS advance_amount
      FROM payments
      WHERE order_id = o.id
        AND payment_type = 'advance'
        AND status = 'success'
    ) ap ON TRUE
    WHERE o.pickup_date BETWEEN $1::date AND $2::date
      AND o.pickup_slot_id = ANY($3::int[])
      AND o.status NOT IN ('draft', 'cancelled')
      AND ($4::int IS NULL OR p.pincode_group_id = $4::int)
      ${methodClause}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

const fetchTopStats = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    WITH period_orders AS (
      SELECT
        o.id,
        o.final_total,
        o.estimated_total,
        o.status,
        o.payment_status,
        COALESCE(ps.advance_sum, 0) AS advance_sum,
        COALESCE(ps.refunded_sum, 0) AS refunded_sum
      FROM orders o
      LEFT JOIN user_address_details uad ON uad.id = o.address_id
      LEFT JOIN pincodes p ON p.pincode = uad.pincode
      LEFT JOIN (
        SELECT
          order_id,
          SUM(amount) FILTER (
            WHERE status = 'success' AND payment_type = 'advance'
          ) AS advance_sum,
          SUM(amount) FILTER (
            WHERE status = 'refunded' OR payment_type = 'refund'
          ) AS refunded_sum
        FROM payments
        GROUP BY order_id
      ) ps ON ps.order_id = o.id
      WHERE o.pickup_date BETWEEN $1::date AND $2::date
        AND o.status NOT IN ('draft', 'cancelled')
        AND ($3::int IS NULL OR p.pincode_group_id = $3::int)
    )
    SELECT
      COUNT(*)::int AS total_orders,

      COALESCE(SUM(COALESCE(final_total, estimated_total, 0)), 0) AS gross_revenue,

      COALESCE(SUM(
        CASE
          WHEN payment_status = 'paid' THEN COALESCE(final_total, estimated_total, 0)
          WHEN payment_status = 'partially_paid' THEN advance_sum
          ELSE 0
        END
      ), 0) AS payments_received,

      COALESCE(SUM(
        CASE
          WHEN payment_status = 'pending' THEN COALESCE(final_total, estimated_total, 0)
          WHEN payment_status = 'partially_paid' THEN GREATEST(
            0,
            COALESCE(final_total, estimated_total, 0) - advance_sum
          )
          ELSE 0
        END
      ), 0) AS pending_payments,

      COALESCE(SUM(
        CASE
          WHEN payment_status = 'refunded' THEN COALESCE(final_total, estimated_total, 0)
          ELSE refunded_sum
        END
      ), 0) AS refunds_adjustments
    FROM period_orders
    `,
    [start, end, pincodeGroupId],
  );

  const row = rows[0] || {};
  const { gross_revenue, gst_18, net_revenue } = splitGrossNetGst(row.gross_revenue);

  return [
    { key: 'total_orders', value: String(row.total_orders || 0) },
    { key: 'net_revenue', value: String(net_revenue) },
    { key: 'gross_revenue', value: String(gross_revenue) },
    { key: 'gst_18', value: String(gst_18) },
    {
      key: 'payments_received',
      value: String(Math.round(Number(row.payments_received || 0))),
    },
    {
      key: 'pending_payments',
      value: String(Math.round(Number(row.pending_payments || 0))),
    },
    {
      key: 'refunds_adjustments',
      value: String(Math.round(Number(row.refunds_adjustments || 0))),
    },
  ];
};

const mapTransaction = (order) => {
  const paymentStatus = String(order.payment_status || 'pending').toLowerCase();
  const finalAmount = getOrderAmount(order);
  const advanceAmount = getAdvanceAmount(order);
  const remainingAmount = Math.max(0, finalAmount - advanceAmount);
  

  return {
    id: Number(order.id),
    order_id: formatOrderId(order),
    customer_id: formatCustomerId(order.user_id),
    service_type: getServiceKey(order.service_id),
    service_category: isExpressOrder(order.service_type_name) ? 'Express' : 'Standard',
    amount: String(finalAmount),
    remaining:
      paymentStatus === 'partially_paid' ? String(remainingAmount) : null,
    payment_status: paymentStatus,
    method: normalizeMethod(order.latest_payment_method),
    date: formatPaymentDate(
      order.payment_completed_at || order.latest_paid_at || order.pickup_date,
    ),
    zone_id: order.zone_id != null ? Number(order.zone_id) : null,
    zone_code: order.zone_code || null,
    zone_name: order.zone_name || null,
  };
};

export const getAdminPaymentsService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (
    filters.paymentStatus &&
    !VALID_PAYMENT_STATUSES.includes(filters.paymentStatus)
  ) {
    throw { status: 400, message: 'Invalid payment_status filter' };
  }

  const zoneFilter = await resolveZoneFilter(query);
  const { pickupShiftSlotIds } = await getPickupShiftConfig();

  const orders = await fetchOrders(
    filters.start,
    filters.end,
    pickupShiftSlotIds,
    filters.method,
    zoneFilter.pincode_group_id,
  );

  const filteredOrders = orders.filter((row) =>
    matchesPaymentStatusFilter(row, filters.paymentStatus),
  );

  const topStats = await fetchTopStats(
    filters.start,
    filters.end,
    zoneFilter.pincode_group_id,
  );

  const transactions = filteredOrders.map(mapTransaction);
  const { items: pageTransactions, pagination } = paginateArray(
    transactions,
    query,
  );

  return {
    period: filters.period === 'custom' ? 'today' : filters.period,
    date_label: formatDateLabel(filters.start, filters.end),
    filters: {
      period: filters.period === 'custom' ? 'today' : filters.period,
      date_from: filters.start,
      date_to: filters.end,
      payment_status: filters.paymentStatus,
      method: filters.method,
      pincode_group_id: zoneFilter.pincode_group_id,
      zone_id: zoneFilter.zone_id,
      zone_code: zoneFilter.zone_code,
      zone_name: zoneFilter.zone_name,
    },
    top_stats: topStats,
    transactions: pageTransactions,
    pagination,
  };
};
