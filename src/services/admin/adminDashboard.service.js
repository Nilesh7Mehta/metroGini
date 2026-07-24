import sql from '../../config/db.js';
import {
  ORDER_ZONE_JOINS,
  orderZoneCityFilterSql,
  resolveGeoFilters,
  userZoneCityExistsSql,
} from '../../utils/adminGeoFilter.util.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const INACTIVE_USER_TICKERS = {
  inactive_users_30: 30,
  inactive_users_45: 45,
  inactive_users_60: 60,
};

const formatDate = (date) => date.toLocaleDateString('en-CA');

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const toIsoOrNull = (value) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const daysBetween = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  if (Number.isNaN(from.getTime())) return null;

  const fromDay = new Date(`${formatDate(from)}T12:00:00`);
  const toDay = new Date(`${formatDate(toDate)}T12:00:00`);
  return Math.floor((toDay - fromDay) / (1000 * 60 * 60 * 24));
};

const resolveDateFilters = (query = {}) => {
  const dateFrom = query.date_from;
  const dateTo = query.date_to;
  const hasFrom = dateFrom != null && dateFrom !== '';
  const hasTo = dateTo != null && dateTo !== '';

  if (hasFrom !== hasTo) {
    throw {
      status: 400,
      message: 'date_from and date_to must be provided together',
    };
  }

  if (!hasFrom) {
    return { dateFrom: null, dateTo: null };
  }

  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) {
    throw {
      status: 400,
      message: 'date_from and date_to must be in YYYY-MM-DD format',
    };
  }

  if (dateFrom > dateTo) {
    throw { status: 400, message: 'date_from must be on or before date_to' };
  }

  return { dateFrom, dateTo };
};

const parseInactiveTicker = (ticker) => {
  if (ticker == null || ticker === '') return null;

  const inactiveDays = INACTIVE_USER_TICKERS[ticker];
  if (!inactiveDays) {
    throw {
      status: 400,
      message:
        'Invalid ticker. Use inactive_users_30, inactive_users_45, or inactive_users_60',
    };
  }

  return { ticker, inactiveDays };
};

// Params: $1 dateFrom, $2 dateTo, $3 pincodeGroupId, $4 referenceDate, $5 cityId
const fetchDashboardMetrics = async (
  dateFrom,
  dateTo,
  pincodeGroupId,
  cityId,
) => {
  const referenceDate = dateTo || formatDate(new Date());

  const { rows } = await sql.query(
    `
    WITH filtered_users AS (
      SELECT u.id, u.created_at
      FROM users u
      WHERE u.role = 'user'
        AND ${userZoneCityExistsSql(3, 5)}
    ),
    user_last_order AS (
      SELECT
        o.user_id,
        MAX(COALESCE(o.delivered_at, o.created_at)) AS last_order_at
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
      GROUP BY o.user_id
    ),
    period_orders AS (
      SELECT o.id, o.user_id, COALESCE(o.final_total, o.estimated_total, 0) AS order_total
      FROM orders o
      ${ORDER_ZONE_JOINS}
      WHERE o.status NOT IN ('draft', 'cancelled')
        AND ($1::date IS NULL OR o.created_at::date >= $1::date)
        AND ($2::date IS NULL OR o.created_at::date <= $2::date)
        AND ${orderZoneCityFilterSql(3, 5)}
    ),
    period_draft_carts AS (
      SELECT DISTINCT o.user_id
      FROM orders o
      ${ORDER_ZONE_JOINS}
      WHERE o.status = 'draft'
        AND o.user_id IS NOT NULL
        AND (
          ($1::date IS NULL AND $2::date IS NULL)
          OR (
            o.created_at::date >= $1::date
            AND o.created_at::date <= $2::date
          )
        )
        AND ${orderZoneCityFilterSql(3, 5)}
    ),
    users_with_orders AS (
      SELECT DISTINCT user_id
      FROM period_orders
      WHERE user_id IS NOT NULL
    ),
    registered_in_period AS (
      SELECT fu.id AS user_id
      FROM filtered_users fu
      WHERE ($1::date IS NULL AND $2::date IS NULL)
        OR (
          fu.created_at::date >= $1::date
          AND fu.created_at::date <= $2::date
        )
    ),
    registered_or_ordered AS (
      SELECT user_id FROM registered_in_period
      UNION
      SELECT user_id FROM users_with_orders
    )
    SELECT
      (SELECT COUNT(*)::int FROM users_with_orders) AS total_users,
      (SELECT COUNT(*)::int FROM period_orders) AS total_orders,
      COALESCE((SELECT SUM(order_total) FROM period_orders), 0) AS total_revenue,
      (SELECT COUNT(*)::int FROM registered_or_ordered) AS total_registered,
      (SELECT COUNT(*)::int FROM period_draft_carts) AS add_to_cart,
      (
        SELECT COUNT(*)::int
        FROM filtered_users fu
        LEFT JOIN user_last_order ulo ON ulo.user_id = fu.id
        WHERE (
          ulo.last_order_at IS NULL
          AND fu.created_at::date <= ($4::date - INTERVAL '30 days')::date
        ) OR (
          ulo.last_order_at IS NOT NULL
          AND ulo.last_order_at::date <= ($4::date - INTERVAL '30 days')::date
        )
      ) AS inactive_users_30,
      (
        SELECT COUNT(*)::int
        FROM filtered_users fu
        LEFT JOIN user_last_order ulo ON ulo.user_id = fu.id
        WHERE (
          ulo.last_order_at IS NULL
          AND fu.created_at::date <= ($4::date - INTERVAL '45 days')::date
        ) OR (
          ulo.last_order_at IS NOT NULL
          AND ulo.last_order_at::date <= ($4::date - INTERVAL '45 days')::date
        )
      ) AS inactive_users_45,
      (
        SELECT COUNT(*)::int
        FROM filtered_users fu
        LEFT JOIN user_last_order ulo ON ulo.user_id = fu.id
        WHERE (
          ulo.last_order_at IS NULL
          AND fu.created_at::date <= ($4::date - INTERVAL '60 days')::date
        ) OR (
          ulo.last_order_at IS NOT NULL
          AND ulo.last_order_at::date <= ($4::date - INTERVAL '60 days')::date
        )
      ) AS inactive_users_60
    `,
    [dateFrom, dateTo, pincodeGroupId, referenceDate, cityId],
  );

  const row = rows[0];
  const totalOrders = parseInt(row.total_orders, 10);
  const totalRegistered = parseInt(row.total_registered, 10);
  const conversionRate =
    totalRegistered > 0
      ? Math.round((totalOrders / totalRegistered) * 1000) / 10
      : 0;

  return {
    total_users: parseInt(row.total_users, 10),
    total_orders: totalOrders,
    total_revenue: Math.round(parseFloat(row.total_revenue) || 0),
    total_registered: totalRegistered,
    conversion_rate: conversionRate,
    add_to_cart: parseInt(row.add_to_cart, 10),
    inactive_users_30: parseInt(row.inactive_users_30, 10),
    inactive_users_45: parseInt(row.inactive_users_45, 10),
    inactive_users_60: parseInt(row.inactive_users_60, 10),
  };
};

// Params: $1 pincodeGroupId, $2 referenceDate, $3 inactiveDays, $4 cityId
const fetchInactiveUsersList = async (
  inactiveDays,
  dateTo,
  pincodeGroupId,
  cityId,
) => {
  const referenceDate = dateTo || formatDate(new Date());

  const { rows } = await sql.query(
    `
    WITH filtered_users AS (
      SELECT u.id, u.created_at
      FROM users u
      WHERE u.role = 'user'
        AND ${userZoneCityExistsSql(1, 4)}
    ),
    user_last_order AS (
      SELECT
        o.user_id,
        MAX(COALESCE(o.delivered_at, o.created_at)) AS last_order_at
      FROM orders o
      WHERE o.user_id IS NOT NULL
        AND o.status NOT IN ('draft', 'cancelled')
      GROUP BY o.user_id
    ),
    user_order_stats AS (
      SELECT
        o.user_id,
        COUNT(*)::int AS total_orders,
        COALESCE(
          SUM(COALESCE(o.final_total, o.estimated_total, 0)),
          0
        ) AS total_spend
      FROM orders o
      WHERE o.status NOT IN ('draft', 'cancelled')
      GROUP BY o.user_id
    )
    SELECT
      u.id,
      u.full_name,
      u.mobile,
      u.email,
      u.status AS account_status,
      fu.created_at AS registered_at,
      ulo.last_order_at,
      COALESCE(uos.total_orders, 0) AS total_orders,
      COALESCE(uos.total_spend, 0) AS total_spend
    FROM filtered_users fu
    JOIN users u ON u.id = fu.id
    LEFT JOIN user_last_order ulo ON ulo.user_id = fu.id
    LEFT JOIN user_order_stats uos ON uos.user_id = fu.id
    WHERE (
      ulo.last_order_at IS NULL
      AND fu.created_at::date <= ($2::date - ($3::int * INTERVAL '1 day'))::date
    ) OR (
      ulo.last_order_at IS NOT NULL
      AND ulo.last_order_at::date <= ($2::date - ($3::int * INTERVAL '1 day'))::date
    )
    ORDER BY COALESCE(ulo.last_order_at, fu.created_at) ASC, u.id ASC
    `,
    [pincodeGroupId, referenceDate, inactiveDays, cityId],
  );

  const reference = new Date(`${referenceDate}T12:00:00`);

  return rows.map((row) => {
    const lastActivity = row.last_order_at || row.registered_at;
    const daysInactive = daysBetween(lastActivity, reference);

    return {
      id: String(row.id),
      customer_id: formatCustomerId(row.id),
      name: row.full_name || null,
      phone_number: row.mobile || null,
      email: row.email || null,
      account_status: row.account_status || 'active',
      registered_at: toIsoOrNull(row.registered_at),
      last_order_date: toIsoOrNull(row.last_order_at),
      days_inactive: daysInactive,
      total_orders: Number(row.total_orders),
      total_spend: String(Math.round(Number(row.total_spend))),
      inactive_days: inactiveDays,
    };
  });
};

const buildTickers = (metrics) => [
  { key: 'total_users', title: 'Total Users', value: metrics.total_users },
  { key: 'total_orders', title: 'Total Orders', value: metrics.total_orders },
  {
    key: 'total_revenue',
    title: 'Total Revenue',
    value: metrics.total_revenue,
    suffix: '₹',
  },
  {
    key: 'total_registered',
    title: 'Total Registered',
    value: metrics.total_registered,
  },
  {
    key: 'conversion_rate',
    title: 'Conversion Rate',
    value: metrics.conversion_rate,
    suffix: '%',
  },
  { key: 'add_to_cart', title: 'Add to Cart', value: metrics.add_to_cart },
  {
    key: 'inactive_users_30',
    title: 'Inactive Users 30 days',
    value: metrics.inactive_users_30,
  },
  {
    key: 'inactive_users_45',
    title: 'Inactive Users 45 days',
    value: metrics.inactive_users_45,
  },
  {
    key: 'inactive_users_60',
    title: 'Inactive Users 60 days',
    value: metrics.inactive_users_60,
  },
];

export const getAdminDashboardService = async (query = {}) => {
  const { dateFrom, dateTo } = resolveDateFilters(query);
  const geoFilter = await resolveGeoFilters(query);
  const pincodeGroupId = geoFilter.pincode_group_id;
  const cityId = geoFilter.city_id;
  const inactiveTicker = parseInactiveTicker(query.ticker);

  const metrics = await fetchDashboardMetrics(
    dateFrom,
    dateTo,
    pincodeGroupId,
    cityId,
  );

  const data = {
    filters: {
      date_from: dateFrom,
      date_to: dateTo,
      pincode_group_id: pincodeGroupId,
      zone_group: geoFilter.zone_name,
      city_id: cityId,
      city_name: geoFilter.city_name,
    },
    tickers: buildTickers(metrics),
  };

  if (inactiveTicker) {
    data.ticker = inactiveTicker.ticker;
    data.details = await fetchInactiveUsersList(
      inactiveTicker.inactiveDays,
      dateTo,
      pincodeGroupId,
      cityId,
    );
  }

  return data;
};
