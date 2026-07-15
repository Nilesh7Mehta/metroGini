import sql from '../../config/db.js';
import { resolveOpsIssueType } from '../../utils/opsIssue.util.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const resolvePeriodRange = ({ period, date_from, date_to } = {}) => {
  const normalizedPeriod = VALID_PERIODS.includes(period) ? period : 'today';

  if (date_from && date_to && DATE_RE.test(date_from) && DATE_RE.test(date_to)) {
    if (date_from > date_to) {
      throw { status: 400, message: 'date_from must be on or before date_to' };
    }
    return { period: normalizedPeriod, start: date_from, end: date_to };
  }

  const { start, end } = getDateRange(normalizedPeriod);
  return { period: normalizedPeriod, start, end };
};

const parseOptionalPincodeGroupId = (value) => {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'pincode_group_id must be a positive integer' };
  }
  return id;
};

const PINCODE_JOINS = `
  LEFT JOIN user_address_details uad ON uad.id = o.address_id
  LEFT JOIN pincodes p ON p.pincode = uad.pincode
`;

const pincodeFilter = (paramIndex) =>
  `($${paramIndex}::int IS NULL OR p.pincode_group_id = $${paramIndex}::int)`;

const fetchLiveOperations = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS orders_received,

      COUNT(*) FILTER (
        WHERE o.pickup_date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS picked_up,

      COUNT(*) FILTER (
        WHERE o.pickup_date BETWEEN $1::date AND $2::date
          AND o.status IN (
            'picked_up', 'in_process', 'order_finalized',
            'ready_for_delivery', 'out_for_delivery', 'delivered'
          )
      ) AS picked_up_completed,

      COUNT(*) FILTER (
        WHERE o.delivery_date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS delivery_today,

      COUNT(*) FILTER (
        WHERE o.delivery_date BETWEEN $1::date AND $2::date
          AND o.status = 'delivered'
      ) AS delivery_completed
    FROM orders o
    ${PINCODE_JOINS}
    WHERE ${pincodeFilter(3)}
    `,
    [start, end, pincodeGroupId],
  );

  const row = rows[0];
  return {
    orders_received: parseInt(row.orders_received, 10),
    picked_up: parseInt(row.picked_up, 10),
    picked_up_completed: parseInt(row.picked_up_completed, 10),
    delivery_today: parseInt(row.delivery_today, 10),
    delivery_completed: parseInt(row.delivery_completed, 10),
  };
};

const fetchRevenueTickers = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      COALESCE(SUM(pay.amount) FILTER (
        WHERE pay.payment_type = 'advance' AND pay.status = 'success'
      ), 0) AS advance_revenue,
      COALESCE(SUM(pay.amount) FILTER (
        WHERE pay.payment_type = 'remaining' AND pay.status = 'success'
      ), 0) AS remaining_revenue
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    ${PINCODE_JOINS}
    WHERE COALESCE(pay.paid_at, pay.created_at)::date BETWEEN $1::date AND $2::date
      AND o.status NOT IN ('draft', 'cancelled')
      AND ${pincodeFilter(3)}
    `,
    [start, end, pincodeGroupId],
  );

  const advance = parseFloat(rows[0].advance_revenue) || 0;
  const remaining = parseFloat(rows[0].remaining_revenue) || 0;

  return {
    total_revenue: Math.round(advance + remaining),
    advance_revenue: Math.round(advance),
    remaining_revenue: Math.round(remaining),
  };
};

/** Load orders that may contribute to failed/missed pickup/drop cards */
const fetchOpsIssueCandidates = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.status,
      o.pickup_date,
      o.delivery_date,
      o.out_for_pickup_at,
      o.pickup_started_at,
      o.out_for_delivery_at,
      ir.issue_type AS open_issue_type,
      oc.reason_type AS cancel_reason_type
    FROM orders o
    ${PINCODE_JOINS}
    LEFT JOIN LATERAL (
      SELECT issue_type
      FROM order_reports
      WHERE order_id = o.id AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    ) ir ON TRUE
    LEFT JOIN LATERAL (
      SELECT reason_type
      FROM order_cancellations
      WHERE order_id = o.id
      ORDER BY cancelled_at DESC
      LIMIT 1
    ) oc ON TRUE
    WHERE o.status <> 'draft'
      AND ${pincodeFilter(3)}
      AND (
        o.pickup_date BETWEEN $1::date AND $2::date
        OR o.delivery_date BETWEEN $1::date AND $2::date
        OR o.cancelled_at::date BETWEEN $1::date AND $2::date
        OR (
          ir.issue_type IS NOT NULL
          AND o.created_at::date BETWEEN $1::date AND $2::date
        )
      )
    `,
    [start, end, pincodeGroupId],
  );

  return rows;
};

const fetchActionRequired = async (start, end, pincodeGroupId) => {
  const orders = await fetchOpsIssueCandidates(start, end, pincodeGroupId);
  const counts = {
    failed_pickup: 0,
    failed_drop: 0,
    missed_pickup: 0,
    missed_drop: 0,
  };

  for (const order of orders) {
    const issue = resolveOpsIssueType(order);
    if (issue && counts[issue] != null) counts[issue] += 1;
  }

  return counts;
};

const fetchTotalOperations = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    WITH period_orders AS (
      SELECT o.*
      FROM orders o
      ${PINCODE_JOINS}
      WHERE o.created_at::date BETWEEN $1::date AND $2::date
        AND o.status NOT IN ('draft', 'cancelled')
        AND ${pincodeFilter(3)}
    ),
    batches AS (
      SELECT vendor_id, vendor_received_at
      FROM period_orders
      WHERE vendor_received_at IS NOT NULL
      GROUP BY vendor_id, vendor_received_at
    )
    SELECT
      (
        SELECT COUNT(DISTINCT u.id)::int
        FROM users u
        LEFT JOIN user_address_details uad ON uad.user_id = u.id
        LEFT JOIN pincodes p ON p.pincode = uad.pincode
        WHERE u.role = 'user'
          AND ${pincodeFilter(3)}
      ) AS total_customers,
      (SELECT COUNT(*)::int FROM batches) AS total_batches,
      (SELECT COUNT(*)::int FROM period_orders) AS total_orders,
      COALESCE((
        SELECT SUM(COALESCE(final_total, estimated_total, 0))
        FROM period_orders
      ), 0) AS total_revenue
    `,
    [start, end, pincodeGroupId],
  );

  const row = rows[0];
  const totalBatches = parseInt(row.total_batches, 10);
  const totalOrders = parseInt(row.total_orders, 10);
  const avgOrdersPerBatch =
    totalBatches > 0 ? Math.round(totalOrders / totalBatches) : 0;

  return {
    total_customers: parseInt(row.total_customers, 10),
    total_batches: totalBatches,
    total_orders: totalOrders,
    avg_orders_per_batch: avgOrdersPerBatch,
    total_revenue: Math.round(parseFloat(row.total_revenue) || 0),
  };
};

const buildLiveOperations = (metrics) => [
  { key: 'orders_received', value: metrics.orders_received },
  { key: 'picked_up', value: metrics.picked_up },
  { key: 'picked_up_completed', value: metrics.picked_up_completed },
  { key: 'delivery_today', value: metrics.delivery_today },
  { key: 'delivery_completed', value: metrics.delivery_completed },
];

const buildRevenueTickers = (metrics) => [
  { key: 'total_revenue', value: metrics.total_revenue },
  { key: 'advance_revenue', value: metrics.advance_revenue },
  { key: 'remaining_revenue', value: metrics.remaining_revenue },
];

const buildActionRequired = (metrics) => [
  { key: 'failed_pickups', value: metrics.failed_pickup },
  { key: 'failed_drops', value: metrics.failed_drop },
  { key: 'missed_pickups', value: metrics.missed_pickup },
  { key: 'missed_drops', value: metrics.missed_drop },
];

const buildTotalOperations = (metrics) => [
  { key: 'total_customers', value: metrics.total_customers },
  { key: 'total_batches', value: metrics.total_batches },
  { key: 'total_orders', value: metrics.total_orders },
  { key: 'avg_orders_per_batch', value: metrics.avg_orders_per_batch },
  { key: 'total_revenue', value: metrics.total_revenue, suffix: '₹' },
];

export const getAdminDashboardService = async (query = {}) => {
  const { period, start, end } = resolvePeriodRange(query);
  const pincodeGroupId = parseOptionalPincodeGroupId(query.pincode_group_id);

  if (pincodeGroupId != null) {
    const groupCheck = await sql.query(
      `SELECT id FROM pincode_groups WHERE id = $1`,
      [pincodeGroupId],
    );
    if (groupCheck.rows.length === 0) {
      throw { status: 404, message: 'pincode_group_id not found' };
    }
  }

  const [liveMetrics, revenueMetrics, actionMetrics, totalMetrics] =
    await Promise.all([
      fetchLiveOperations(start, end, pincodeGroupId),
      fetchRevenueTickers(start, end, pincodeGroupId),
      fetchActionRequired(start, end, pincodeGroupId),
      fetchTotalOperations(start, end, pincodeGroupId),
    ]);

  const data = {
    period,
    live_operations: buildLiveOperations(liveMetrics),
    revenue_tickers: buildRevenueTickers(revenueMetrics),
    action_required: buildActionRequired(actionMetrics),
    total_operations: buildTotalOperations(totalMetrics),
  };

  if (pincodeGroupId != null) {
    data.pincode_group_id = pincodeGroupId;
  }

  return data;
};
