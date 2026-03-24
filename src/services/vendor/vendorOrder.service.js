import sql from '../../config/db.js';

// Returns { start, end } date strings for the given filter
const formatDate = (date) =>
  date.toLocaleDateString('en-CA'); // YYYY-MM-DD

const getDateRange = (filter) => {
  const now = new Date();

  if (filter === 'this_week') {
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;

    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      start: formatDate(monday),
      end: formatDate(sunday),
    };
  }

  if (filter === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      start: formatDate(firstDay),
      end: formatDate(lastDay),
    };
  }

  const today = formatDate(now);
  return { start: today, end: today };
};

export const orderDashboardService = async (vendor_id, filter = 'today') => {
  const { start, end } = getDateRange(filter);

  // =========================
  // 1. PERFORMANCE OVERVIEW
  // =========================
  const perfResult = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status IN (
          'in_process',
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
      ) AS orders_received,

      COUNT(*) FILTER (
        WHERE status = 'delivered'
      ) AS orders_delivered,

      COALESCE(SUM(actual_weight) FILTER (
        WHERE status = 'delivered'
      ), 0) AS load_processed,

      COALESCE(SUM(final_total) FILTER (
        WHERE status = 'delivered'
      ), 0) AS revenue

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at BETWEEN $2 AND $3
    `,
    [vendor_id, start, end]
  );

  const perf = perfResult.rows[0];

  // =========================
  // 2. BATCH OVERVIEW
  // =========================
  const batchResult = await sql.query(
    `
    SELECT
      o.id,
      s.name AS service_name,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.clothes_count,
      st.name AS service_type_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.vendor_received_at BETWEEN $2 AND $3
      AND o.status NOT IN ('draft', 'cancelled')
    `,
    [vendor_id, start, end]
  );

  const totalOrders = batchResult.rows.length;

  const serviceMap = {};

  for (const row of batchResult.rows) {
    const key = row.service_name || 'Unknown';

    if (!serviceMap[key]) {
      serviceMap[key] = {
        service_name: key,
        orders: [],
      };
    }

    serviceMap[key].orders.push(row);
  }

  const services = Object.values(serviceMap).map((svc) => {
  let min = 0, max = 0, items = 0;

  for (const o of svc.orders) {
    min += Number(o.estimated_weight_min || 0);
    max += Number(o.estimated_weight_max || 0);
    items += Number(o.clothes_count || 0);
  }

  return {
    service_name: svc.service_name,
    service_type: svc.service_type_name, // 👈 important

    estimated_weight: {
      min,
      max,
      unit: 'kg',
    },

    total_items: items,
    total_orders: svc.orders.length,
  };
});

  // =========================
  // 3. OPERATIONAL DISTRIBUTION
  // =========================
  const opsResult = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'picked_up'
      ) AS pending_classification,

      COUNT(*) FILTER (
        WHERE status = 'in_process'
      ) AS in_processing,

      COUNT(*) FILTER (
        WHERE status = 'ready_for_delivery'
      ) AS ready_for_dispatch

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at BETWEEN $2 AND $3
    `,
    [vendor_id, start, end]
  );

  const ops = opsResult.rows[0];

  const batchLabel =
    filter === 'this_week'
      ? 'weeks_batch_overview'
      : filter === 'this_month'
      ? 'months_batch_overview'
      : 'todays_batch_overview';

  return {
    filter,
    date_range: { start, end },

    performance_overview: {
      orders_received: parseInt(perf.orders_received),
      orders_delivered: parseInt(perf.orders_delivered),
      load_processed: {
        value: parseFloat(perf.load_processed),
        unit: 'kg/pieces',
      },
      revenue: parseFloat(perf.revenue),
    },

    [batchLabel]: {
      total_orders: totalOrders,
      services,
    },

    operational_distribution: {
      pending_classification: parseInt(ops.pending_classification),
      in_processing: parseInt(ops.in_processing),
      ready_for_dispatch: parseInt(ops.ready_for_dispatch),
    },
  };
};
