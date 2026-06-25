import sql from '../../config/db.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_SEGMENTS = [
  'active_customers',
  'at_risk_customers',
  'inactive_customers',
];

const ACTIVE_DAYS = 30;
const AT_RISK_DAYS = 60;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

const resolveFilters = (query = {}) => {
  const period = VALID_PERIODS.includes(query.period) ? query.period : 'week';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    segment: VALID_SEGMENTS.includes(query.status) ? query.status : null,
  };
};

const formatStatValue = (value) => String(value);

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatOrderId = (orderId, orderCode) =>
  orderCode || `ORD-${String(orderId).padStart(3, '0')}`;

const parseDateValue = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }
  const parsed = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (fromDate, toDate = new Date()) => {
  const from = parseDateValue(fromDate);
  if (!from) return null;

  const to = new Date(`${formatDate(toDate)}T12:00:00`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
};

const formatRelativeOrderDate = (dateValue) => {
  if (!dateValue) return null;

  const days = daysBetween(dateValue);
  if (days === null) return null;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
};

const resolveSegment = (lastOrderDate, totalOrders) => {
  if (totalOrders <= 0 || !lastOrderDate) return 'inactive_customers';

  const days = daysBetween(lastOrderDate);
  if (days === null) return 'inactive_customers';
  if (days <= ACTIVE_DAYS) return 'active_customers';
  if (days <= AT_RISK_DAYS) return 'at_risk_customers';
  return 'inactive_customers';
};

const resolveSegmentAction = (segment) => {
  if (segment === 'at_risk_customers') return 'send_offer';
  if (segment === 'inactive_customers') return 'send_notification';
  return 'view_details';
};

const fetchCustomerMetrics = async () => {
  const { rows } = await sql.query(
    `
    WITH customer_users AS (
      SELECT id, full_name, mobile, email
      FROM users
      WHERE role = 'user'
    ),
    order_stats AS (
      SELECT
        o.user_id,
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(COALESCE(o.final_total, o.estimated_total, 0)), 0) AS total_spend,
        MAX(COALESCE(o.delivered_at, o.created_at::date)) AS last_order_date
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
      GROUP BY o.user_id
    ),
    last_orders AS (
      SELECT DISTINCT ON (o.user_id)
        o.user_id,
        o.id AS last_order_id,
        o.order_code,
        COALESCE(o.delivered_at, o.created_at::date) AS last_order_date
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
      ORDER BY o.user_id, COALESCE(o.delivered_at, o.created_at) DESC, o.id DESC
    )
    SELECT
      u.id,
      u.full_name,
      u.mobile,
      u.email,
      COALESCE(os.total_orders, 0) AS total_orders,
      COALESCE(os.total_spend, 0) AS total_spend,
      lo.last_order_id,
      lo.order_code,
      lo.last_order_date
    FROM customer_users u
    LEFT JOIN order_stats os ON os.user_id = u.id
    LEFT JOIN last_orders lo ON lo.user_id = u.id
    ORDER BY u.id DESC
    `,
  );

  return rows.map((row) => {
    const totalOrders = Number(row.total_orders);
    const segment = resolveSegment(row.last_order_date, totalOrders);

    return {
      id: String(row.id),
      customer_id: formatCustomerId(row.id),
      name: row.full_name || null,
      phone_number: row.mobile || null,
      email: row.email || null,
      last_order_id: row.last_order_id
        ? formatOrderId(row.last_order_id, row.order_code)
        : null,
      last_order_date: formatRelativeOrderDate(row.last_order_date) || 'Never',
      total_orders: totalOrders,
      total_spend: String(Math.round(Number(row.total_spend))),
      status: segment,
      action: resolveSegmentAction(segment),
    };
  });
};

const buildUserSegments = (customers) => {
  const counts = {
    active_customers: 0,
    at_risk_customers: 0,
    inactive_customers: 0,
  };

  customers.forEach((customer) => {
    counts[customer.status] += 1;
  });

  return [
    { key: 'active_customers', value: formatStatValue(counts.active_customers) },
    { key: 'at_risk_customers', value: formatStatValue(counts.at_risk_customers) },
    {
      key: 'inactive_customers',
      value: formatStatValue(counts.inactive_customers),
    },
  ];
};

const buildTopStats = async (customers) => {
  const totalUsers = customers.length;
  const activeUsers = customers.filter(
    (customer) => customer.status === 'active_customers',
  ).length;
  const inactiveUsers = customers.filter(
    (customer) => customer.status === 'inactive_customers',
  ).length;
  const usersWithOrders = customers.filter(
    (customer) => customer.total_orders > 0,
  ).length;

  const conversionRate =
    totalUsers > 0 ? Math.round((usersWithOrders / totalUsers) * 100) : 0;

  const { rows } = await sql.query(
    `
    SELECT COALESCE(AVG(COALESCE(final_total, estimated_total, 0)), 0) AS avg_order_value
    FROM orders
    WHERE status = 'delivered'
      AND COALESCE(final_total, estimated_total, 0) > 0
    `,
  );

  const avgOrderValue = Math.round(Number(rows[0]?.avg_order_value || 0));

  const { rows: downloadRows } = await sql.query(
    `
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE role = 'user'
      AND is_mobile_verified = TRUE
    `,
  );

  return [
    { key: 'total_users', value: formatStatValue(totalUsers) },
    { key: 'active_users', value: formatStatValue(activeUsers) },
    { key: 'inactive_users', value: formatStatValue(inactiveUsers) },
    { key: 'conversion_rate', value: `${conversionRate}%` },
    {
      key: 'app_downloads',
      value: formatStatValue(downloadRows[0]?.count || totalUsers),
    },
    { key: 'avg_order_value', value: String(avgOrderValue) },
  ];
};

const buildWeekTrend = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      created_at::date AS day,
      COUNT(DISTINCT user_id)::int AS active_users
    FROM orders
    WHERE created_at::date BETWEEN $1::date AND $2::date
      AND user_id IS NOT NULL
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY created_at::date
    ORDER BY day ASC
    `,
    [start, end],
  );

  const countsByDay = Object.fromEntries(
    rows.map((row) => [formatDate(new Date(row.day)), Number(row.active_users)]),
  );

  const startDate = new Date(`${start}T12:00:00`);
  const labels = [];
  const values = [];

  for (let index = 0; index < 7; index += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    labels.push(WEEKDAY_LABELS[index]);
    values.push(countsByDay[formatDate(current)] || 0);
  }

  return { labels, values };
};

const buildTodayTrend = async (start) => {
  const { rows } = await sql.query(
    `
    SELECT COUNT(DISTINCT user_id)::int AS active_users
    FROM orders
    WHERE created_at::date = $1::date
      AND user_id IS NOT NULL
      AND status NOT IN ('draft', 'cancelled')
    `,
    [start],
  );

  const todayLabel = new Date(`${start}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
  });

  return {
    labels: [todayLabel],
    values: [rows[0]?.active_users || 0],
  };
};

const buildMonthTrend = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      created_at::date AS day,
      COUNT(DISTINCT user_id)::int AS active_users
    FROM orders
    WHERE created_at::date BETWEEN $1::date AND $2::date
      AND user_id IS NOT NULL
      AND status NOT IN ('draft', 'cancelled')
    GROUP BY created_at::date
    ORDER BY day ASC
    `,
    [start, end],
  );

  return {
    labels: rows.map((row) =>
      new Date(row.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    ),
    values: rows.map((row) => Number(row.active_users)),
  };
};

const buildActiveUsersTrend = async (period, start, end) => {
  if (period === 'today') return buildTodayTrend(start);
  if (period === 'month') return buildMonthTrend(start, end);
  return buildWeekTrend(start, end);
};

export const getAdminMarketingService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (filters.segment && !VALID_SEGMENTS.includes(filters.segment)) {
    throw { status: 400, message: 'Invalid status filter' };
  }

  const customers = await fetchCustomerMetrics();
  const segmentDetails = filters.segment
    ? customers.filter((customer) => customer.status === filters.segment)
    : customers;

  const topStats = await buildTopStats(customers);
  const userSegments = buildUserSegments(customers);
  const activeUsersTrend = await buildActiveUsersTrend(
    filters.period,
    filters.start,
    filters.end,
  );

  return {
    period: filters.period,
    top_stats: topStats,
    user_segments: userSegments,
    active_users_trend: activeUsersTrend,
    segment_details: segmentDetails,
  };
};
