import sql from '../../config/db.js';
import { paginateArray } from '../../utils/pagination.util.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

const addDays = (dateStr, days) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
};

const daysInRange = (start, end) => {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
};

const getDateRangeFromPeriod = (period) => {
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

const parseOptionalDate = (value, fieldName) => {
  if (value == null || value === '') return null;
  if (!DATE_RE.test(String(value))) {
    throw { status: 400, message: `${fieldName} must be in YYYY-MM-DD format` };
  }
  return String(value);
};

const parseOptionalPincodeGroupId = (value) => {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'pincode_group_id must be a positive integer' };
  }
  return id;
};

const resolveFilters = async (query = {}) => {
  const dateFrom = parseOptionalDate(query.date_from, 'date_from');
  const dateTo = parseOptionalDate(query.date_to, 'date_to');
  const hasFrom = dateFrom != null;
  const hasTo = dateTo != null;

  if (hasFrom !== hasTo) {
    throw {
      status: 400,
      message: 'date_from and date_to must be provided together',
    };
  }

  if (hasFrom && dateFrom > dateTo) {
    throw { status: 400, message: 'date_from must be on or before date_to' };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'week';
  const range = hasFrom
    ? { start: dateFrom, end: dateTo }
    : getDateRangeFromPeriod(period);

  const pincodeGroupId = parseOptionalPincodeGroupId(query.pincode_group_id);
  let zoneGroup = null;

  if (pincodeGroupId != null) {
    const { rows } = await sql.query(
      `SELECT id, name FROM pincode_groups WHERE id = $1`,
      [pincodeGroupId],
    );
    if (!rows.length) {
      throw { status: 404, message: 'pincode_group_id not found' };
    }
    zoneGroup = rows[0].name;
  }

  const status = VALID_STATUS_FILTERS.includes(query.status) ? query.status : null;

  return {
    period: hasFrom ? 'custom' : period,
    start: range.start,
    end: range.end,
    dateFrom: hasFrom ? dateFrom : null,
    dateTo: hasTo ? dateTo : null,
    pincodeGroupId,
    zoneGroup,
    status,
  };
};

const formatStatValue = (value) => {
  const num = Math.round(Number(value || 0));
  return num.toLocaleString('en-IN');
};

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatOrderId = (orderId, orderCode) =>
  orderCode || `ORD-${String(orderId).padStart(3, '0')}`;

const toDateOnly = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
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

const userZoneFilterSql = (paramIndex) => `
  (
    $${paramIndex}::int IS NULL
    OR EXISTS (
      SELECT 1
      FROM user_address_details uad
      JOIN pincodes p ON p.pincode = uad.pincode
      WHERE uad.user_id = u.id
        AND p.pincode_group_id = $${paramIndex}::int
    )
  )
`;

const orderZoneFilterSql = (paramIndex) =>
  `($${paramIndex}::int IS NULL OR p.pincode_group_id = $${paramIndex}::int)`;

const fetchCustomerMetrics = async (pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    WITH customer_users AS (
      SELECT u.id, u.full_name, u.mobile, u.email, u.status, u.created_at
      FROM users u
      WHERE u.role = 'user'
        AND ${userZoneFilterSql(1)}
    ),
    order_stats AS (
      SELECT
        o.user_id,
        COUNT(*) FILTER (WHERE o.status NOT IN ('draft', 'cancelled'))::int AS total_orders,
        COALESCE(
          SUM(COALESCE(o.final_total, o.estimated_total, 0))
            FILTER (WHERE o.status NOT IN ('draft', 'cancelled')),
          0
        ) AS total_spend,
        MAX(COALESCE(o.delivered_at, o.created_at))
          FILTER (WHERE o.status NOT IN ('draft', 'cancelled')) AS last_order_date
      FROM orders o
      LEFT JOIN user_address_details uad ON uad.id = o.address_id
      LEFT JOIN pincodes p ON p.pincode = uad.pincode
      WHERE o.user_id IS NOT NULL
        AND ${orderZoneFilterSql(1)}
      GROUP BY o.user_id
    ),
    last_orders AS (
      SELECT DISTINCT ON (o.user_id)
        o.user_id,
        o.id AS last_order_id,
        o.order_code,
        COALESCE(o.delivered_at, o.created_at) AS last_order_date
      FROM orders o
      LEFT JOIN user_address_details uad ON uad.id = o.address_id
      LEFT JOIN pincodes p ON p.pincode = uad.pincode
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
        AND ${orderZoneFilterSql(1)}
      ORDER BY o.user_id, COALESCE(o.delivered_at, o.created_at) DESC, o.id DESC
    ),
    draft_carts AS (
      SELECT DISTINCT ON (o.user_id)
        o.user_id,
        o.id AS cart_order_id,
        o.updated_at AS cart_updated_at
      FROM orders o
      LEFT JOIN user_address_details uad ON uad.id = o.address_id
      LEFT JOIN pincodes p ON p.pincode = uad.pincode
      WHERE o.user_id IS NOT NULL
        AND o.status = 'draft'
        AND ${orderZoneFilterSql(1)}
      ORDER BY o.user_id, o.updated_at DESC, o.id DESC
    )
    SELECT
      u.id,
      u.full_name,
      u.mobile,
      u.email,
      u.created_at AS registered_at,
      COALESCE(os.total_orders, 0) AS total_orders,
      COALESCE(os.total_spend, 0) AS total_spend,
      lo.last_order_id,
      lo.order_code,
      lo.last_order_date,
      dc.cart_order_id,
      dc.cart_updated_at
    FROM customer_users u
    LEFT JOIN order_stats os ON os.user_id = u.id
    LEFT JOIN last_orders lo ON lo.user_id = u.id
    LEFT JOIN draft_carts dc ON dc.user_id = u.id
    ORDER BY u.id DESC
    `,
    [pincodeGroupId],
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
      id: Number(row.id),
      customer_id: formatCustomerId(row.id),
      name: row.full_name || null,
      phone_number: row.mobile || null,
      email: row.email || null,
      registered_at: toDateOnly(row.registered_at),
      last_order_id: row.last_order_id
        ? formatOrderId(row.last_order_id, row.order_code)
        : null,
      last_order_date: toDateOnly(row.last_order_date),
      total_orders: totalOrders,
      total_spend: Math.round(Number(row.total_spend || 0)),
      segment,
      funnel_status: funnelStatus,
      status: segment,
      action: resolveDetailAction(segment),
    };
  });
};

const fetchPeriodOrderStats = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(COALESCE(o.final_total, o.estimated_total, 0)), 0) AS total_revenue,
      COUNT(DISTINCT o.user_id)::int AS users_with_orders
    FROM orders o
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    WHERE o.status NOT IN ('draft', 'cancelled')
      AND o.created_at::date BETWEEN $1::date AND $2::date
      AND ${orderZoneFilterSql(3)}
    `,
    [start, end, pincodeGroupId],
  );

  return {
    total_orders: Number(rows[0]?.total_orders || 0),
    total_revenue: Math.round(Number(rows[0]?.total_revenue || 0)),
    users_with_orders: Number(rows[0]?.users_with_orders || 0),
  };
};

const fetchNewUsersCount = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT COUNT(*)::int AS count
    FROM users u
    WHERE u.role = 'user'
      AND u.created_at::date BETWEEN $1::date AND $2::date
      AND ${userZoneFilterSql(3)}
    `,
    [start, end, pincodeGroupId],
  );

  return Number(rows[0]?.count || 0);
};

const buildTopStats = async (customers, start, end, pincodeGroupId) => {
  const totalUsers = customers.length;
  const usersBooked = customers.filter((c) => c.total_orders > 0).length;
  const usersNeverOrdered = totalUsers - usersBooked;
  const activeUsers = customers.filter((c) => c.segment === 'active_customers').length;
  const repeatUsers = customers.filter((c) => c.total_orders > 1).length;
  const newUsers = await fetchNewUsersCount(start, end, pincodeGroupId);
  const periodStats = await fetchPeriodOrderStats(start, end, pincodeGroupId);

  const conversionRate =
    totalUsers > 0 ? Math.round((usersBooked / totalUsers) * 100) : 0;
  const avgOrderValue =
    periodStats.total_orders > 0
      ? Math.round(periodStats.total_revenue / periodStats.total_orders)
      : 0;

  return [
    { key: 'total_users', value: formatStatValue(totalUsers) },
    { key: 'total_orders', value: formatStatValue(periodStats.total_orders) },
    { key: 'total_revenue', value: formatStatValue(periodStats.total_revenue) },
    { key: 'users_booked', value: formatStatValue(usersBooked) },
    { key: 'users_never_ordered', value: formatStatValue(usersNeverOrdered) },
    { key: 'active_users', value: formatStatValue(activeUsers) },
    { key: 'new_users', value: formatStatValue(newUsers) },
    { key: 'repeat_users', value: formatStatValue(repeatUsers) },
    { key: 'conversion_rate', value: `${conversionRate}%` },
    { key: 'avg_order_value', value: String(avgOrderValue) },
  ];
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

const buildDayLabels = (start, end) => {
  const totalDays = daysInRange(start, end);
  const labels = [];
  const dates = [];

  for (let i = 0; i < totalDays; i += 1) {
    const date = addDays(start, i);
    dates.push(date);

    if (totalDays === 7) {
      const weekday = new Date(`${date}T12:00:00`).getDay();
      labels.push(WEEKDAY_LABELS[(weekday + 6) % 7]);
    } else if (totalDays === 1) {
      labels.push(
        new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
          weekday: 'short',
        }),
      );
    } else {
      labels.push(
        new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
      );
    }
  }

  return { labels, dates };
};

const mapSeriesToDays = (dates, rows, valueKey) => {
  const byDay = Object.fromEntries(
    rows.map((row) => [toDateOnly(row.day), Number(row[valueKey] || 0)]),
  );
  return dates.map((date) => byDay[date] || 0);
};

const fetchOrdersRevenueByDay = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      o.created_at::date AS day,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(COALESCE(o.final_total, o.estimated_total, 0)), 0) AS revenue
    FROM orders o
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    WHERE o.status NOT IN ('draft', 'cancelled')
      AND o.created_at::date BETWEEN $1::date AND $2::date
      AND ${orderZoneFilterSql(3)}
    GROUP BY o.created_at::date
    ORDER BY day ASC
    `,
    [start, end, pincodeGroupId],
  );

  return rows;
};

const fetchNewUsersByDay = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      u.created_at::date AS day,
      COUNT(*)::int AS new_users
    FROM users u
    WHERE u.role = 'user'
      AND u.created_at::date BETWEEN $1::date AND $2::date
      AND ${userZoneFilterSql(3)}
    GROUP BY u.created_at::date
    ORDER BY day ASC
    `,
    [start, end, pincodeGroupId],
  );

  return rows;
};

const fetchActiveUsersByDay = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      o.created_at::date AS day,
      COUNT(DISTINCT o.user_id)::int AS active_users
    FROM orders o
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    WHERE o.status NOT IN ('draft', 'cancelled')
      AND o.user_id IS NOT NULL
      AND o.created_at::date BETWEEN $1::date AND $2::date
      AND ${orderZoneFilterSql(3)}
    GROUP BY o.created_at::date
    ORDER BY day ASC
    `,
    [start, end, pincodeGroupId],
  );

  return rows;
};

const fetchOrdersByZone = async (start, end, pincodeGroupId) => {
  const { rows } = await sql.query(
    `
    SELECT
      COALESCE(pg.name, 'Unknown') AS zone_name,
      COUNT(*)::int AS order_count
    FROM orders o
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
    LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
    WHERE o.status NOT IN ('draft', 'cancelled')
      AND o.created_at::date BETWEEN $1::date AND $2::date
      AND ${orderZoneFilterSql(3)}
    GROUP BY COALESCE(pg.name, 'Unknown')
    ORDER BY order_count DESC, zone_name ASC
    `,
    [start, end, pincodeGroupId],
  );

  return rows;
};

const buildCharts = async (customers, start, end, pincodeGroupId) => {
  const { labels, dates } = buildDayLabels(start, end);
  const [orderRows, newUserRows, zoneRows] = await Promise.all([
    fetchOrdersRevenueByDay(start, end, pincodeGroupId),
    fetchNewUsersByDay(start, end, pincodeGroupId),
    fetchOrdersByZone(start, end, pincodeGroupId),
  ]);

  const usersBooked = customers.filter((c) => c.total_orders > 0).length;
  const usersNeverOrdered = customers.length - usersBooked;
  const activeUsers = customers.filter((c) => c.segment === 'active_customers').length;
  const inactiveUsers = customers.length - activeUsers;

  return {
    orders_by_day: {
      labels,
      values: mapSeriesToDays(dates, orderRows, 'order_count'),
    },
    revenue_by_day: {
      labels,
      values: mapSeriesToDays(dates, orderRows, 'revenue').map((v) =>
        Math.round(Number(v)),
      ),
    },
    new_users_by_day: {
      labels,
      values: mapSeriesToDays(dates, newUserRows, 'new_users'),
    },
    orders_by_zone: {
      labels: zoneRows.map((row) => row.zone_name),
      values: zoneRows.map((row) => Number(row.order_count)),
    },
    booked_vs_never: {
      labels: ['Booked order', 'Never ordered'],
      values: [usersBooked, usersNeverOrdered],
    },
    active_vs_inactive: {
      labels: ['Active', 'Inactive'],
      values: [activeUsers, inactiveUsers],
    },
  };
};

const buildActiveUsersTrend = async (start, end, pincodeGroupId) => {
  const { labels, dates } = buildDayLabels(start, end);
  const rows = await fetchActiveUsersByDay(start, end, pincodeGroupId);

  return {
    labels,
    values: mapSeriesToDays(dates, rows, 'active_users'),
  };
};

const mapSegmentDetail = (customer, statusOverride = null) => {
  const status = statusOverride || customer.segment;
  return {
    id: customer.id,
    customer_id: customer.customer_id,
    name: customer.name,
    email: customer.email,
    phone_number: customer.phone_number,
    last_order_id: customer.last_order_id,
    last_order_date: customer.last_order_date,
    total_orders: customer.total_orders,
    total_spend: customer.total_spend,
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
  if (query.status && !VALID_STATUS_FILTERS.includes(query.status)) {
    throw {
      status: 400,
      message:
        'Invalid status filter. Use all | active_customers | at_risk_customers | inactive_customers | registered_never_used | added_to_cart | abandoned_cart',
    };
  }

  const filters = await resolveFilters(query);
  const customers = await fetchCustomerMetrics(filters.pincodeGroupId);

  const [topStats, charts, activeUsersTrend] = await Promise.all([
    buildTopStats(customers, filters.start, filters.end, filters.pincodeGroupId),
    buildCharts(customers, filters.start, filters.end, filters.pincodeGroupId),
    buildActiveUsersTrend(filters.start, filters.end, filters.pincodeGroupId),
  ]);

  const segmentDetails = buildSegmentDetails(customers, filters.status);
  const { items: pageDetails, pagination } = paginateArray(
    segmentDetails,
    query,
  );

  return {
    filters: {
      zone_group: filters.zoneGroup,
      date_from: filters.dateFrom || filters.start,
      date_to: filters.dateTo || filters.end,
    },
    top_stats: topStats,
    user_segments: buildUserSegments(customers),
    marketing_funnel: buildMarketingFunnel(customers),
    charts,
    active_users_trend: activeUsersTrend,
    segment_details: pageDetails,
    pagination,
  };
};
