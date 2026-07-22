import sql from '../../config/db.js';
import { paginateArray } from '../../utils/pagination.util.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_STATUSES = ['pending', 'resolved'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];
const VALID_RAISED_BY = ['Merchant', 'Rider', 'System', 'Customer'];

const HIGH_PRIORITY_TYPES = ['pickup_failure', 'rider_issue', 'damaged_item'];

const ISSUE_META = {
  count_mismatch: { raised_by: 'Merchant', priority: 'low' },
  extra_care_required: { raised_by: 'Merchant', priority: 'medium' },
  damaged_item: { raised_by: 'Merchant', priority: 'high' },
  merchant_issue: { raised_by: 'Merchant', priority: 'medium' },
  pickup_failure: { raised_by: 'Rider', priority: 'high' },
  rider_issue: { raised_by: 'Rider', priority: 'high' },
  payment_issue: { raised_by: 'System', priority: 'low' },
  addon_charge: { raised_by: 'System', priority: 'medium' },
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
      status: query.status || null,
      priority: query.priority || null,
      raisedBy: query.raised_by || null,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    status: query.status || null,
    priority: query.priority || null,
    raisedBy: query.raised_by || null,
  };
};

const getIssueMeta = (issueType) =>
  ISSUE_META[issueType] || { raised_by: 'Customer', priority: 'medium' };

const mapDbStatus = (status) => {
  const value = String(status || 'open').toLowerCase();
  if (value === 'resolved' || value === 'closed') return 'resolved';
  return 'pending';
};

const formatIssueId = (id) => `ISS-${String(id).padStart(3, '0')}`;

const formatOrderId = (orderId, orderCode) =>
  orderCode || `ORD-${String(orderId).padStart(3, '0')}`;

const formatTimeAgo = (dateValue) => {
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) {
    return `${Math.max(1, diffMins)}m`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
};

const resolveAction = (status) =>
  status === 'pending' ? 'take_action' : 'view_details';

const fetchIssues = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      ir.id,
      ir.order_id,
      ir.user_id,
      ir.issue_type,
      ir.issue_reason,
      ir.description,
      ir.status,
      ir.created_at,
      ir.updated_at,
      o.order_code
    FROM order_reports ir
    INNER JOIN orders o ON o.id = ir.order_id
    WHERE ir.created_at::date BETWEEN $1::date AND $2::date
      AND o.status NOT IN ('draft', 'cancelled')
    ORDER BY ir.id DESC
    `,
    [start, end],
  );

  return rows;
};

const fetchTopStats = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      (
        SELECT COUNT(*)::int
        FROM order_reports ir
        INNER JOIN orders o ON o.id = ir.order_id
        WHERE ir.status = 'open'
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS total_active,

      (
        SELECT COUNT(*)::int
        FROM order_reports ir
        INNER JOIN orders o ON o.id = ir.order_id
        WHERE ir.status = 'open'
          AND ir.issue_type = ANY($3::text[])
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS high_priority,

      (
        SELECT COUNT(*)::int
        FROM order_reports ir
        INNER JOIN orders o ON o.id = ir.order_id
        WHERE ir.status = 'open'
          AND ir.created_at::date BETWEEN $1::date AND $2::date
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS pending_review,

      (
        SELECT COUNT(*)::int
        FROM order_reports ir
        INNER JOIN orders o ON o.id = ir.order_id
        WHERE ir.status IN ('resolved', 'closed')
          AND ir.updated_at::date = CURRENT_DATE
          AND o.status NOT IN ('draft', 'cancelled')
      ) AS resolved_today
    `,
    [start, end, HIGH_PRIORITY_TYPES],
  );

  const row = rows[0];

  return [
    { key: 'total_active', value: String(row.total_active) },
    { key: 'high_priority', value: String(row.high_priority) },
    { key: 'pending_review', value: String(row.pending_review) },
    { key: 'resolved_today', value: String(row.resolved_today) },
  ];
};

const mapIssue = (row) => {
  const meta = getIssueMeta(row.issue_type);
  const status = mapDbStatus(row.status);

  return {
    id: row.id,
    issue_id: formatIssueId(row.id),
    order_id: formatOrderId(row.order_id, row.order_code),
    issue_type: row.issue_type,
    raised_by: meta.raised_by,
    status,
    priority: meta.priority,
    time_ago: formatTimeAgo(row.created_at),
    action: resolveAction(status),
    order_ref: row.order_id,
  };
};

const matchesFilters = (issue, filters) => {
  if (filters.status && issue.status !== filters.status) return false;
  if (filters.priority && issue.priority !== filters.priority) return false;
  if (
    filters.raisedBy &&
    issue.raised_by.toLowerCase() !== filters.raisedBy.toLowerCase()
  ) {
    return false;
  }
  return true;
};

export const getAdminIssuesService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (filters.status && !VALID_STATUSES.includes(filters.status)) {
    throw { status: 400, message: 'Invalid status filter' };
  }
  if (filters.priority && !VALID_PRIORITIES.includes(filters.priority)) {
    throw { status: 400, message: 'Invalid priority filter' };
  }
  if (
    filters.raisedBy &&
    !VALID_RAISED_BY.some(
      (value) => value.toLowerCase() === filters.raisedBy.toLowerCase(),
    )
  ) {
    throw { status: 400, message: 'Invalid raised_by filter' };
  }

  const rows = await fetchIssues(filters.start, filters.end);
  const issues = rows.map(mapIssue).filter((issue) => matchesFilters(issue, filters));
  const topStats = await fetchTopStats(filters.start, filters.end);
  const { items: pageIssues, pagination } = paginateArray(issues, query);

  return {
    period: filters.period === 'custom' ? 'today' : filters.period,
    top_stats: topStats,
    issues: pageIssues,
    pagination,
  };
};
