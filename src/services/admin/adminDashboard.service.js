import sql from '../../config/db.js';

const VALID_PERIODS = ['today', 'week', 'month'];

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

const str = (value) => String(value ?? 0);

const fetchLiveOperations = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS orders_received,

      COUNT(*) FILTER (
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
          AND LOWER(COALESCE(ts.shift_name, '')) LIKE '%morning%'
      ) AS morning_orders,

      COUNT(*) FILTER (
        WHERE o.created_at::date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
          AND LOWER(COALESCE(ts.shift_name, '')) LIKE '%evening%'
      ) AS evening_orders,

      COUNT(*) FILTER (
        WHERE o.pickup_date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS pickups_total,

      COUNT(*) FILTER (
        WHERE o.pickup_date BETWEEN $1::date AND $2::date
          AND o.status IN (
            'picked_up', 'in_process', 'order_finalized',
            'ready_for_delivery', 'out_for_delivery', 'delivered'
          )
      ) AS pickups_completed,

      COUNT(*) FILTER (
        WHERE o.status = 'delivered'
          AND o.delivered_at BETWEEN $1::date AND $2::date
      ) AS deliveries_completed,

      COALESCE(SUM(o.final_total) FILTER (
        WHERE o.status = 'delivered'
          AND o.delivered_at BETWEEN $1::date AND $2::date
          AND o.final_total IS NOT NULL
      ), 0) AS revenue
    FROM orders o
    LEFT JOIN time_slots ts ON ts.id = o.pickup_slot_id
    `,
    [start, end],
  );

  const row = rows[0];

  const { rows: riderRows } = await sql.query(
    `SELECT COUNT(*)::int AS count
     FROM riders
     WHERE is_active = TRUE AND status = 'active'`,
  );

  const { rows: vendorRows } = await sql.query(
    `SELECT COUNT(*)::int AS count
     FROM vendors
     WHERE is_active = TRUE`,
  );

  return {
    orders_received: {
      morning: parseInt(row.morning_orders, 10),
      evening: parseInt(row.evening_orders, 10),
      total: parseInt(row.orders_received, 10),
    },
    pickups_completed: parseInt(row.pickups_completed, 10),
    pickups_total: parseInt(row.pickups_total, 10),
    deliveries_completed: parseInt(row.deliveries_completed, 10),
    revenue: parseFloat(row.revenue),
    active_riders: riderRows[0].count,
    active_merchants: vendorRows[0].count,
  };
};

const fetchActionRequired = async () => {
  const { rows } = await sql.query(
    `
    SELECT
      (
        SELECT COUNT(DISTINCT o.id)::int
        FROM orders o
        JOIN order_cancellations oc ON oc.order_id = o.id
        WHERE o.status = 'cancelled'
          AND (
            LOWER(COALESCE(oc.reason_type, '')) LIKE '%pickup%'
            OR LOWER(COALESCE(oc.reason_type, '')) LIKE '%drop%'
            OR LOWER(COALESCE(oc.reason_type, '')) LIKE '%delivery%'
            OR LOWER(COALESCE(oc.reason_description, '')) LIKE '%otp%'
            OR LOWER(COALESCE(oc.reason_description, '')) LIKE '%rider%'
          )
      ) AS failed_missed,

      (
        SELECT COUNT(*)::int
        FROM orders o
        JOIN service_types st ON st.id = o.service_type_id
        WHERE o.status NOT IN ('draft', 'cancelled', 'delivered')
          AND LOWER(COALESCE(st.name, '')) LIKE '%express%'
          AND o.delivery_date IS NOT NULL
          AND (
            o.delivery_date < CURRENT_DATE
            OR (
              o.delivery_date = CURRENT_DATE
              AND EXISTS (
                SELECT 1 FROM time_slots dts
                WHERE dts.id = o.delivery_slot_id
                  AND (o.delivery_date + dts.start_time) BETWEEN NOW() AND NOW() + INTERVAL '3 hours'
              )
            )
          )
      ) AS express_near_sla,

      (
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.actual_clothes_count IS NOT NULL
          AND o.clothes_count IS NOT NULL
          AND o.clothes_count > 0
          AND ABS(o.actual_clothes_count - o.clothes_count) >= 3
          AND o.status NOT IN ('draft', 'cancelled', 'delivered')
      ) AS count_mismatch,

      (
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.status = 'order_finalized'
      ) AS awaiting_bill_approval,

      (
        SELECT COUNT(*)::int
        FROM order_reports
        WHERE status = 'open'
      ) AS flagged_by_merchant,

      (
        SELECT COUNT(*)::int
        FROM payments
        WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '12 hours'
      ) AS payments_pending
    `,
  );

  const row = rows[0];

  return {
    failed_missed: parseInt(row.failed_missed, 10),
    express_near_sla: parseInt(row.express_near_sla, 10),
    count_mismatch: parseInt(row.count_mismatch, 10),
    awaiting_bill_approval: parseInt(row.awaiting_bill_approval, 10),
    flagged_by_merchant: parseInt(row.flagged_by_merchant, 10),
    payments_pending: parseInt(row.payments_pending, 10),
  };
};

const fetchTotalOperations = async (start, end) => {
  const { rows } = await sql.query(
    `
    WITH period_orders AS (
      SELECT *
      FROM orders
      WHERE created_at::date BETWEEN $1::date AND $2::date
        AND status NOT IN ('draft', 'cancelled')
    ),
    batches AS (
      SELECT vendor_id, vendor_received_at
      FROM period_orders
      WHERE vendor_received_at IS NOT NULL
      GROUP BY vendor_id, vendor_received_at
    ),
    batch_stats AS (
      SELECT
        COUNT(*)::int AS batch_count,
        COALESCE(
          AVG(
            EXTRACT(EPOCH FROM (delivered_at::timestamp - vendor_received_at::timestamp)) / 3600
          ) FILTER (WHERE delivered_at IS NOT NULL AND vendor_received_at IS NOT NULL),
          0
        ) AS avg_processing_hours
      FROM period_orders
      WHERE vendor_received_at IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'user') AS total_customers,
      (SELECT COUNT(*)::int FROM batches) AS total_batches,
      (SELECT COUNT(*)::int FROM period_orders) AS total_orders,
      bs.batch_count,
      bs.avg_processing_hours,
      COALESCE((
        SELECT SUM(final_total)
        FROM period_orders
        WHERE status = 'delivered' AND final_total IS NOT NULL
      ), 0) AS total_revenue
    FROM batch_stats bs
    `,
    [start, end],
  );

  const row = rows[0];
  const totalBatches = parseInt(row.total_batches, 10);
  const totalOrders = parseInt(row.total_orders, 10);
  const avgOrdersPerBatch =
    totalBatches > 0 ? Math.round(totalOrders / totalBatches) : 0;
  const avgProcessingHours = Math.round(parseFloat(row.avg_processing_hours) || 0);

  return {
    total_customers: parseInt(row.total_customers, 10),
    total_batches: totalBatches,
    total_orders: totalOrders,
    avg_orders_per_batch: avgOrdersPerBatch,
    avg_processing_time: avgProcessingHours,
    total_revenue: parseFloat(row.total_revenue),
  };
};

const buildLiveOperations = (metrics) => [
  {
    key: 'orders_received',
    value: `${metrics.orders_received.morning}/${metrics.orders_received.evening}`,
    subtitle: '(Morning / Evening)',
  },
  {
    key: 'pickups_completed',
    value: `${metrics.pickups_completed}/${metrics.pickups_total}`,
  },
  {
    key: 'deliveries_completed',
    value: str(metrics.deliveries_completed),
  },
  {
    key: 'revenue',
    value: str(Math.round(metrics.revenue)),
  },
  {
    key: 'active_riders',
    value: str(metrics.active_riders),
  },
  {
    key: 'active_merchants',
    value: str(metrics.active_merchants),
  },
];

const buildActionRequired = (metrics) => [
  {
    key: 'failed_pickups_drops',
    value: str(metrics.failed_missed),
  },
  {
    key: 'express_near_sla',
    value: str(metrics.express_near_sla),
  },
  {
    key: 'count_mismatch',
    value: str(metrics.count_mismatch),
  },
  {
    key: 'bill_approval',
    value: str(metrics.awaiting_bill_approval),
  },
  {
    key: 'merchant_flagged',
    value: str(metrics.flagged_by_merchant),
  },
  {
    key: 'payments_pending',
    value: str(metrics.payments_pending),
  },
];

const buildTotalOperations = (metrics) => [
  {
    key: 'total_customers',
    value: str(metrics.total_customers),
  },
  {
    key: 'total_batches',
    value: str(metrics.total_batches),
  },
  {
    key: 'total_orders',
    value: str(metrics.total_orders),
  },
  {
    key: 'avg_orders_per_batch',
    value: str(metrics.avg_orders_per_batch),
  },
  {
    key: 'avg_processing_time',
    value: str(metrics.avg_processing_time),
  },
  {
    key: 'total_revenue',
    value: str(Math.round(metrics.total_revenue)),
  },
];

export const getAdminDashboardService = async (period = 'today') => {
  const normalizedPeriod = VALID_PERIODS.includes(period) ? period : 'today';
  const { start, end } = getDateRange(normalizedPeriod);

  const [liveMetrics, actionMetrics, totalMetrics] = await Promise.all([
    fetchLiveOperations(start, end),
    fetchActionRequired(),
    fetchTotalOperations(start, end),
  ]);

  return {
    period: normalizedPeriod,
    live_operations: buildLiveOperations(liveMetrics),
    action_required: buildActionRequired(actionMetrics),
    total_operations: buildTotalOperations(totalMetrics),
  };
};
