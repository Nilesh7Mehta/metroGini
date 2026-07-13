import sql from '../../config/db.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_SEGMENTS = [
  'active_customers',
  'at_risk_customers',
  'inactive_customers',
];
const VALID_FUNNEL_STATUSES = [
  'registered_never_used',
  'added_to_cart',
  'abandoned_cart',
];
const VALID_STATUS_FILTERS = [
  'all',
  ...VALID_SEGMENTS,
  ...VALID_FUNNEL_STATUSES,
];

const ACTIVE_DAYS = 30;
const AT_RISK_DAYS = 60;
const ABANDONED_CART_HOURS = 48;
const FUNNEL_REGISTRATION_DAYS = 15;

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
    status: VALID_STATUS_FILTERS.includes(query.status) ? query.status : null,
  };
};

const formatStatValue = (value) => String(value);

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatOrderId = (orderId, orderCode) =>
  orderCode || `ORD-${String(orderId).padStart(3, '0')}`;

const toIsoOrNull = (value) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const parseDateValue = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (fromDate, toDate = new Date()) => {
  const from = parseDateValue(fromDate);
  if (!from) return null;

  const fromDay = new Date(`${formatDate(from)}T12:00:00`);
  const toDay = new Date(`${formatDate(toDate)}T12:00:00`);
  return Math.floor((toDay - fromDay) / (1000 * 60 * 60 * 24));
};

const hoursSince = (fromDate, toDate = new Date()) => {
  const from = parseDateValue(fromDate);
  if (!from) return null;
  return (toDate.getTime() - from.getTime()) / (1000 * 60 * 60);
};

const resolveSegment = (lastOrderDate, totalOrders) => {
  if (totalOrders <= 0 || !lastOrderDate) return 'inactive_customers';

  const days = daysBetween(lastOrderDate);
  if (days === null) return 'inactive_customers';
  if (days <= ACTIVE_DAYS) return 'active_customers';
  if (days <= AT_RISK_DAYS) return 'at_risk_customers';
  return 'inactive_customers';
};

const resolveFunnelStatus = ({
  totalOrders,
  hasDraft,
  cartUpdatedAt,
  daysSinceRegistration,
}) => {
  if (
    daysSinceRegistration == null ||
    daysSinceRegistration > FUNNEL_REGISTRATION_DAYS
  ) {
    return null;
  }

  // Already ordered → out of acquisition funnel
  if (totalOrders > 0) return null;

  if (hasDraft) {
    const hours = hoursSince(cartUpdatedAt);
    if (hours != null && hours >= ABANDONED_CART_HOURS) return 'abandoned_cart';
    return 'added_to_cart';
  }

  return 'registered_never_used';
};

const resolveDetailAction = (status) => {
  if (status === 'at_risk_customers') return 'send_offer';
  if (
    status === 'inactive_customers' ||
    status === 'registered_never_used' ||
    status === 'added_to_cart' ||
    status === 'abandoned_cart'
  ) {
    return 'send_notification';
  }
  return 'view_details';
};

const fetchCustomerMetrics = async () => {
  const { rows } = await sql.query(
    `
    WITH customer_users AS (
      SELECT id, full_name, mobile, email, status, created_at
      FROM users
      WHERE role = 'user'
    ),
    order_stats AS (
      SELECT
        o.user_id,
        COUNT(*) FILTER (WHERE o.status NOT IN ('draft', 'cancelled'))::int AS total_orders,
        COUNT(*)::int AS any_order_count,
        COALESCE(
          SUM(COALESCE(o.final_total, o.estimated_total, 0))
            FILTER (WHERE o.status NOT IN ('draft', 'cancelled')),
          0
        ) AS total_spend,
        MAX(COALESCE(o.delivered_at, o.created_at))
          FILTER (WHERE o.status NOT IN ('draft', 'cancelled')) AS last_order_date
      FROM orders o
      WHERE o.user_id IS NOT NULL
      GROUP BY o.user_id
    ),
    last_orders AS (
      SELECT DISTINCT ON (o.user_id)
        o.user_id,
        o.id AS last_order_id,
        o.order_code,
        COALESCE(o.delivered_at, o.created_at) AS last_order_date
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
      ORDER BY o.user_id, COALESCE(o.delivered_at, o.created_at) DESC, o.id DESC
    ),
    draft_carts AS (
      SELECT DISTINCT ON (o.user_id)
        o.user_id,
        o.id AS cart_order_id,
        o.updated_at AS cart_updated_at,
        COALESCE(o.clothes_count, 0)::int AS cart_item_count,
        COALESCE(o.estimated_total, 0) AS cart_value
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status = 'draft'
      ORDER BY o.user_id, o.updated_at DESC, o.id DESC
    )
    SELECT
      u.id,
      u.full_name,
      u.mobile,
      u.email,
      u.status AS account_status,
      u.created_at AS registered_at,
      COALESCE(os.total_orders, 0) AS total_orders,
      COALESCE(os.any_order_count, 0) AS any_order_count,
      COALESCE(os.total_spend, 0) AS total_spend,
      lo.last_order_id,
      lo.order_code,
      lo.last_order_date,
      dc.cart_order_id,
      dc.cart_updated_at,
      dc.cart_item_count,
      dc.cart_value
    FROM customer_users u
    LEFT JOIN order_stats os ON os.user_id = u.id
    LEFT JOIN last_orders lo ON lo.user_id = u.id
    LEFT JOIN draft_carts dc ON dc.user_id = u.id
    ORDER BY u.id DESC
    `,
  );

  return rows.map((row) => {
    const totalOrders = Number(row.total_orders);
    const hasDraft = row.cart_order_id != null;
    const daysSinceRegistration = daysBetween(row.registered_at) ?? 0;
    const segment = resolveSegment(row.last_order_date, totalOrders);
    const funnelStatus = resolveFunnelStatus({
      totalOrders,
      hasDraft,
      cartUpdatedAt: row.cart_updated_at,
      daysSinceRegistration,
    });

    return {
      id: String(row.id),
      customer_id: formatCustomerId(row.id),
      name: row.full_name || null,
      phone_number: row.mobile || null,
      email: row.email || null,
      registered_at: toIsoOrNull(row.registered_at),
      days_since_registration: daysSinceRegistration,
      account_status: row.account_status || 'active',
      last_order_id: row.last_order_id
        ? formatOrderId(row.last_order_id, row.order_code)
        : null,
      last_order_date: toIsoOrNull(row.last_order_date),
      total_orders: totalOrders,
      total_spend: String(Math.round(Number(row.total_spend))),
      cart_updated_at: toIsoOrNull(row.cart_updated_at),
      cart_item_count: hasDraft ? Number(row.cart_item_count || 0) : 0,
      cart_value: hasDraft ? String(Math.round(Number(row.cart_value || 0))) : '0',
      segment,
      funnel_status: funnelStatus,
      status: segment,
      action: resolveDetailAction(segment),
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
    counts[customer.segment] += 1;
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

const buildMarketingFunnel = (customers) => {
  const counts = {
    registered_never_used: 0,
    added_to_cart: 0,
    abandoned_cart: 0,
  };

  customers.forEach((customer) => {
    if (customer.funnel_status && counts[customer.funnel_status] != null) {
      counts[customer.funnel_status] += 1;
    }
  });

  return [
    {
      key: 'registered_never_used',
      value: formatStatValue(counts.registered_never_used),
    },
    { key: 'added_to_cart', value: formatStatValue(counts.added_to_cart) },
    { key: 'abandoned_cart', value: formatStatValue(counts.abandoned_cart) },
  ];
};

const buildTopStats = async (customers) => {
  const totalUsers = customers.length;
  const activeUsers = customers.filter(
    (customer) => customer.segment === 'active_customers',
  ).length;
  const inactiveUsers = customers.filter(
    (customer) => customer.segment === 'inactive_customers',
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

const mapSegmentDetail = (customer, statusOverride = null) => {
  const status = statusOverride || customer.segment;
  return {
    id: customer.id,
    customer_id: customer.customer_id,
    name: customer.name,
    phone_number: customer.phone_number,
    email: customer.email,
    registered_at: customer.registered_at,
    days_since_registration: customer.days_since_registration,
    account_status: customer.account_status,
    last_order_id: customer.last_order_id,
    last_order_date: customer.last_order_date,
    total_orders: customer.total_orders,
    total_spend: customer.total_spend,
    cart_updated_at: customer.cart_updated_at,
    cart_item_count: customer.cart_item_count,
    cart_value: customer.cart_value,
    status,
    action: resolveDetailAction(status),
  };
};

const buildSegmentDetails = (customers, statusFilter) => {
  if (!statusFilter || statusFilter === 'all') {
    return customers.map((customer) => mapSegmentDetail(customer));
  }

  if (VALID_FUNNEL_STATUSES.includes(statusFilter)) {
    return customers
      .filter((customer) => customer.funnel_status === statusFilter)
      .map((customer) => mapSegmentDetail(customer, statusFilter));
  }

  return customers
    .filter((customer) => customer.segment === statusFilter)
    .map((customer) => mapSegmentDetail(customer, statusFilter));
};

export const getAdminMarketingService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (query.status && !VALID_STATUS_FILTERS.includes(query.status)) {
    throw {
      status: 400,
      message:
        'Invalid status filter. Use all | active_customers | at_risk_customers | inactive_customers | registered_never_used | added_to_cart | abandoned_cart',
    };
  }

  const customers = await fetchCustomerMetrics();
  const topStats = await buildTopStats(customers);
  const userSegments = buildUserSegments(customers);
  const marketingFunnel = buildMarketingFunnel(customers);
  const activeUsersTrend = await buildActiveUsersTrend(
    filters.period,
    filters.start,
    filters.end,
  );
  const segmentDetails = buildSegmentDetails(customers, filters.status);

  return {
    period: filters.period,
    top_stats: topStats,
    user_segments: userSegments,
    marketing_funnel: marketingFunnel,
    active_users_trend: activeUsersTrend,
    segment_details: segmentDetails,
  };
};
