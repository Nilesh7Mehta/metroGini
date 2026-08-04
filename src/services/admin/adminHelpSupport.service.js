import sql from '../../config/db.js';
import { paginateArray } from '../../utils/pagination.util.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_STATUSES = ['pending', 'resolved'];
const VALID_TYPES = ['user', 'rider', 'vendor'];

const RAISED_BY_BY_TYPE = {
  user: 'Customer',
  vendor: 'Merchant',
  rider: 'Rider',
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
      type: query.type || null,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    status: query.status || null,
    type: query.type || null,
  };
};

const isOpenStatus = (status) => {
  const value = String(status || 'open').toLowerCase();
  return value !== 'resolved' && value !== 'closed';
};

const mapDbStatus = (status) => (isOpenStatus(status) ? 'pending' : 'resolved');

const formatRequestId = (id) => `SUP-${String(id).padStart(3, '0')}`;

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

const fetchSupportRequests = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT
      sr.id,
      sr.type,
      sr.identity_id,
      sr.report_issue,
      sr.message,
      sr.status,
      sr.resolution_note,
      sr.created_at,
      sr.updated_at,
      CASE sr.type
        WHEN 'user' THEN u.full_name
        WHEN 'vendor' THEN COALESCE(v.laundry_shop_name, v.owner_contact_name)
        WHEN 'rider' THEN r.full_name
      END AS name,
      CASE sr.type
        WHEN 'user' THEN u.mobile
        WHEN 'vendor' THEN v.mobile_number
        WHEN 'rider' THEN r.mobile_number
      END AS contact_phone
    FROM support_requests sr
    LEFT JOIN users u ON sr.type = 'user' AND u.id = sr.identity_id
    LEFT JOIN vendors v ON sr.type = 'vendor' AND v.id = sr.identity_id
    LEFT JOIN riders r ON sr.type = 'rider' AND r.id = sr.identity_id
    WHERE sr.created_at::date BETWEEN $1::date AND $2::date
    ORDER BY sr.id DESC
    `,
    [start, end],
  );

  return rows;
};

const fetchResolvedTodayCount = async (start, end) => {
  const { rows } = await sql.query(
    `
    SELECT COUNT(*)::int AS count
    FROM support_requests
    WHERE status IN ('resolved', 'closed')
      AND updated_at::date = CURRENT_DATE
      AND created_at::date BETWEEN $1::date AND $2::date
    `,
    [start, end],
  );

  return rows[0]?.count || 0;
};

const buildTopStats = (requests, resolvedToday) => {
  const pendingRequests = requests.filter((request) => request.status === 'pending');

  return [
    { key: 'total_open', value: String(pendingRequests.length) },
    { key: 'pending_review', value: String(pendingRequests.length) },
    { key: 'resolved_today', value: String(resolvedToday) },
    {
      key: 'rider_requests',
      value: String(pendingRequests.filter((request) => request.type === 'rider').length),
    },
  ];
};

const mapSupportRequest = (row) => {
  const status = mapDbStatus(row.status);
  const type = String(row.type || '').toLowerCase();

  return {
    id: row.id,
    request_id: formatRequestId(row.id),
    type,
    raised_by: RAISED_BY_BY_TYPE[type] || type,
    identity_id: row.identity_id,
    name: row.name || null,
    contact_phone: row.contact_phone || null,
    report_issue: row.report_issue || null,
    report_message: row.message,
    status,
    resolution_note: row.resolution_note ?? null,
    time_ago: formatTimeAgo(row.created_at),
    action: resolveAction(status),
  };
};

const matchesFilters = (request, filters) => {
  if (filters.status && request.status !== filters.status) return false;
  if (filters.type && request.type !== filters.type) return false;
  return true;
};

export const getAdminHelpSupportService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (filters.status && !VALID_STATUSES.includes(filters.status)) {
    throw { status: 400, message: 'Invalid status filter' };
  }
  if (filters.type && !VALID_TYPES.includes(filters.type)) {
    throw { status: 400, message: 'Invalid type filter' };
  }

  const rows = await fetchSupportRequests(filters.start, filters.end);
  const allRequests = rows.map(mapSupportRequest);
  const requests = allRequests.filter((request) => matchesFilters(request, filters));
  const resolvedToday = await fetchResolvedTodayCount(filters.start, filters.end);
  const topStats = buildTopStats(allRequests, resolvedToday);
  const { items: pageRequests, pagination } = paginateArray(requests, query);

  return {
    period: filters.period === 'custom' ? 'today' : filters.period,
    top_stats: topStats,
    requests: pageRequests,
    pagination,
  };
};

const toDbStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'resolved' || value === 'closed') return 'resolved';
  if (value === 'pending' || value === 'open') return 'open';
  return null;
};

const fetchSupportRequestById = async (id) => {
  const { rows } = await sql.query(
    `
    SELECT
      sr.id,
      sr.type,
      sr.identity_id,
      sr.report_issue,
      sr.message,
      sr.status,
      sr.resolution_note,
      sr.created_at,
      sr.updated_at,
      CASE sr.type
        WHEN 'user' THEN u.full_name
        WHEN 'vendor' THEN COALESCE(v.laundry_shop_name, v.owner_contact_name)
        WHEN 'rider' THEN r.full_name
      END AS name,
      CASE sr.type
        WHEN 'user' THEN u.mobile
        WHEN 'vendor' THEN v.mobile_number
        WHEN 'rider' THEN r.mobile_number
      END AS contact_phone
    FROM support_requests sr
    LEFT JOIN users u ON sr.type = 'user' AND u.id = sr.identity_id
    LEFT JOIN vendors v ON sr.type = 'vendor' AND v.id = sr.identity_id
    LEFT JOIN riders r ON sr.type = 'rider' AND r.id = sr.identity_id
    WHERE sr.id = $1
    `,
    [id],
  );

  return rows[0] || null;
};

export const updateAdminHelpSupportService = async (rawId, body = {}) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    throw { status: 400, message: 'Invalid help support id' };
  }

  if (body.status === undefined || body.status === null || body.status === '') {
    throw { status: 400, message: 'status is required' };
  }

  const dbStatus = toDbStatus(body.status);
  if (!dbStatus) {
    throw { status: 400, message: 'status must be pending or resolved' };
  }

  const existing = await fetchSupportRequestById(id);
  if (!existing) {
    throw { status: 404, message: 'Help support request not found' };
  }

  const resolutionNote =
    body.resolution_note !== undefined
      ? body.resolution_note == null || String(body.resolution_note).trim() === ''
        ? null
        : String(body.resolution_note).trim()
      : existing.resolution_note ?? null;

  const { rows } = await sql.query(
    `
    UPDATE support_requests
    SET status = $1,
        resolution_note = $2,
        updated_at = NOW()
    WHERE id = $3
    RETURNING id
    `,
    [dbStatus, resolutionNote, id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: 'Help support request not found' };
  }

  const updated = await fetchSupportRequestById(id);
  return mapSupportRequest(updated);
};
