import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import {
  getShiftScheduleForRider,
  getShiftSchedulesForRiders,
  parseRiderScheduleFromBody,
  resolveRiderScheduleUpdate,
  saveShiftScheduleForRider,
  clearShiftScheduleForRider,
} from '../common/riderGroupShiftSchedule.service.js';
import {
  ORDER_ZONE_JOINS,
  orderZoneCityFilterSql,
  resolveGeoFilters,
  scheduleMatchesGeo,
} from '../../utils/adminGeoFilter.util.js';
import { resolveOpsIssueType } from '../../utils/opsIssue.util.js';
import { paginateArray } from '../../utils/pagination.util.js';

const AADHAR_REGEX = /^\d{12}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_WINDOW = 7;
const VALID_SHIFTS = ['morning', 'evening'];

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
};

const PICKUP_COMPLETED_STATUSES = [
  'picked_up',
  'in_process',
  'order_finalized',
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
];

const formatDate = (date) => date.toLocaleDateString('en-CA');

const formatRiderId = (id) => `RID-${String(id).padStart(3, '0')}`;

const formatLotCode = (riderId) => `LOT-${String(riderId).padStart(3, '0')}`;

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const PICKUP_SUCCESS_STATUSES = [
  'picked_up',
  'in_process',
  'order_finalized',
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
];

const PICKUP_PENDING_STATUSES = ['booked', 'out_for_pickup', 'pickup_in_progress'];

const VALID_PERIODS = ['today', 'week', 'month'];

const parseRiderId = (raw) => {
  const match = String(raw).match(/^(?:RID-)?(\d+)$/i);
  if (!match) throw { status: 400, message: 'Invalid rider id' };
  return parseInt(match[1], 10);
};

const resolveRiderStatusFilter = (status) => {
  if (!status || status === 'all') return null;
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  throw { status: 400, message: 'status must be active or inactive' };
};

const formatRiderStatus = (isActive) => (isActive ? 'active' : 'inactive');

const resolveShiftKey = (shiftName) => {
  if (!shiftName) return null;
  return String(shiftName).trim().toLowerCase().split(/\s+/)[0];
};

const addDays = (dateStr, days) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
};

const toDateStr = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
};

const getIsoDayOfWeek = (dateStr) => {
  const date = new Date(`${dateStr}T12:00:00`);
  return ((date.getDay() + 6) % 7) + 1;
};

const parseOptionalDate = (value, fieldName) => {
  if (value == null || value === '') return null;
  if (!DATE_RE.test(String(value))) {
    throw { status: 400, message: `${fieldName} must be in YYYY-MM-DD format` };
  }
  return String(value);
};

const parseOptionalShift = (value) => {
  if (value == null || value === '') return null;
  const shift = String(value).trim().toLowerCase();
  if (!VALID_SHIFTS.includes(shift)) {
    throw { status: 400, message: 'shift must be morning or evening' };
  }
  return shift;
};

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const getAdminDisplayStatus = (status) => {
  if (status === 'in_process') return 'in_processing';
  return status;
};

const getEstimatedKg = (min, max) => {
  const weightMin = Number(min || 0);
  const weightMax = Number(max || 0);
  if (weightMin && weightMax) {
    return parseFloat(((weightMin + weightMax) / 2).toFixed(1));
  }
  return parseFloat((weightMax || weightMin || 0).toFixed(1));
};

const resolveIssueType = (order) => {
  const opsIssue = resolveOpsIssueType(order);
  if (opsIssue) return opsIssue;
  if (order.open_issue_type) return order.open_issue_type;

  if (
    order.actual_clothes_count != null &&
    order.clothes_count != null &&
    order.clothes_count > 0 &&
    Math.abs(order.actual_clothes_count - order.clothes_count) >= 3
  ) {
    return 'count_mismatch';
  }

  return null;
};

const buildEstFin = (order) => {
  if (Number(order.service_id) === 1) {
    const est = getEstimatedKg(order.estimated_weight_min, order.estimated_weight_max);
    const fin = order.actual_weight != null ? Number(order.actual_weight) : est;
    return `${est}kg/${fin}kg`;
  }

  const est = Number(order.clothes_count || 0);
  const fin = Number(order.actual_clothes_count ?? order.clothes_count ?? 0);
  return `${est}/${fin} Items`;
};

const buildCharges = (order) =>
  Math.round(Number(order.final_total ?? order.estimated_total ?? 0));

const resolvePickupStatus = (order) => {
  const issue = resolveOpsIssueType(order);
  if (issue === 'failed_pickup' || issue === 'missed_pickup') return 'failed';
  if (PICKUP_COMPLETED_STATUSES.includes(order.status)) return 'completed';
  return 'pending';
};

const resolveDeliveryStatus = (order) => {
  const issue = resolveOpsIssueType(order);
  if (issue === 'failed_drop' || issue === 'missed_drop') return 'failed';
  if (order.status === 'delivered') return 'completed';
  return 'pending';
};

const isPickupOnDate = (order, dateStr) => toDateStr(order.pickup_date) === dateStr;
const isDeliveryOnDate = (order, dateStr) =>
  toDateStr(order.delivery_date) === dateStr;
const isActiveOnDate = (order, dateStr) =>
  isPickupOnDate(order, dateStr) || isDeliveryOnDate(order, dateStr);

const resolveShiftSlotIds = async (shift) => {
  if (!shift) return null;
  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();
  return pickupShiftSlotIds.filter(
    (slotId) => resolveShiftKey(shiftByPickupSlot[slotId]?.shift_type) === shift,
  );
};

const resolveRiderZoneMeta = (
  shiftSchedule = [],
  { dayOfWeek = null, shift = null, pincodeGroupId = null } = {},
) => {
  let entries = [...shiftSchedule];

  if (pincodeGroupId != null) {
    entries = entries.filter((e) => Number(e.pincode_group_id) === Number(pincodeGroupId));
  }
  if (dayOfWeek != null) {
    entries = entries.filter((e) => Number(e.day_of_week) === Number(dayOfWeek));
  }
  if (shift) {
    entries = entries.filter((e) => resolveShiftKey(e.shift_name) === shift);
  }

  const entry = entries[0] || shiftSchedule[0] || null;
  if (!entry) {
    return { zone_id: null, zone_code: null, zone_name: null, shift: shift || null };
  }

  return {
    zone_id: entry.pincode_group_id != null ? Number(entry.pincode_group_id) : null,
    zone_code: entry.group_code || null,
    zone_name: entry.group_name || entry.group_code || null,
    shift: resolveShiftKey(entry.shift_name) || shift || null,
  };
};

const resolveRiderListFilters = (query = {}) => {
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

  const weekStart = parseOptionalDate(query.week_start, 'week_start');
  const requestedDate = parseOptionalDate(query.date, 'date');

  let selectedDate;
  let rangeStart;
  let rangeEnd;

  if (hasFrom) {
    rangeStart = dateFrom;
    rangeEnd = dateTo;
    if (requestedDate && requestedDate >= dateFrom && requestedDate <= dateTo) {
      selectedDate = requestedDate;
    } else {
      selectedDate = dateFrom;
    }
  } else {
    selectedDate = requestedDate || weekStart || formatDate(new Date());
    rangeStart = weekStart || selectedDate;
    rangeEnd = addDays(rangeStart, DAYS_WINDOW - 1);
  }

  return {
    selectedDate,
    weekStart,
    dateFrom,
    dateTo,
    rangeStart,
    rangeEnd,
    shift: parseOptionalShift(query.shift),
  };
};

const mapRiderOrderRow = (order, selectedDate, shiftByPickupSlot = {}) => {
  const shiftMeta = shiftByPickupSlot[order.pickup_slot_id];
  const shift = resolveShiftKey(shiftMeta?.shift_type || order.pickup_shift_name);
  const scheduledDate = isPickupOnDate(order, selectedDate)
    ? toDateStr(order.pickup_date)
    : toDateStr(order.delivery_date) || selectedDate;

  return {
    id: Number(order.id),
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    customer_id: formatCustomerId(order.user_id),
    customer_name: order.customer_name || null,
    service_type: getServiceKey(order.service_id),
    status: getAdminDisplayStatus(order.status),
    shift,
    issue_type: resolveIssueType(order),
    est_fin: buildEstFin(order),
    charges: buildCharges(order),
    pickup_status: resolvePickupStatus(order),
    delivery_status: resolveDeliveryStatus(order),
    scheduled_date: scheduledDate,
  };
};

const buildRiderLotCode = (riderId, pickupShiftSlotIds, orders = []) => {
  const slotId = orders
    .map((o) => Number(o.pickup_slot_id))
    .find((id) => pickupShiftSlotIds.includes(id));
  const batchIndex =
    slotId != null ? Math.max(0, pickupShiftSlotIds.indexOf(slotId)) : 0;

  return `LOT-R${String(riderId).padStart(3, '0')}-${String(batchIndex + 1).padStart(2, '0')}`;
};

const countDayTasks = (orders, dateStr) => {
  const pickupOrders = orders.filter((o) => isPickupOnDate(o, dateStr));
  const deliveryOrders = orders.filter((o) => isDeliveryOnDate(o, dateStr));

  const pickupsCompleted = pickupOrders.filter(
    (o) => resolvePickupStatus(o) === 'completed',
  ).length;
  const deliveriesCompleted = deliveryOrders.filter(
    (o) => resolveDeliveryStatus(o) === 'completed',
  ).length;
  const pendingTasks =
    pickupOrders.filter((o) => resolvePickupStatus(o) === 'pending').length
    + deliveryOrders.filter((o) => resolveDeliveryStatus(o) === 'pending').length;
  const failedTasks =
    pickupOrders.filter((o) => resolvePickupStatus(o) === 'failed').length
    + deliveryOrders.filter((o) => resolveDeliveryStatus(o) === 'failed').length;

  return {
    total_pickups: pickupOrders.length,
    pickups_completed: pickupsCompleted,
    total_deliveries: deliveryOrders.length,
    deliveries_completed: deliveriesCompleted,
    pending_tasks: pendingTasks,
    failed_tasks: failedTasks,
    total_tasks: pickupOrders.length + deliveryOrders.length,
  };
};

const buildOverviewDays = (rangeStart, rangeEnd, orders) => {
  const days = [];
  let date = rangeStart;

  while (date <= rangeEnd) {
    days.push({
      date,
      total_tasks: countDayTasks(orders, date).total_tasks,
    });
    date = addDays(date, 1);
  }

  return days;
};

const fetchRiderScheduleOrders = async ({
  riderIds = null,
  rangeStart,
  rangeEnd,
  pincodeGroupId = null,
  cityId = null,
  shiftSlotIds = null,
}) => {
  const params = [rangeStart, rangeEnd, pincodeGroupId, cityId];
  const conditions = [
    `o.assigned_rider_id IS NOT NULL`,
    `o.status <> 'draft'`,
    `(
      o.pickup_date BETWEEN $1::date AND $2::date
      OR o.delivery_date BETWEEN $1::date AND $2::date
    )`,
    orderZoneCityFilterSql(3, 4),
  ];

  if (riderIds?.length) {
    params.push(riderIds);
    conditions.push(`o.assigned_rider_id = ANY($${params.length}::int[])`);
  }

  if (shiftSlotIds?.length) {
    params.push(shiftSlotIds);
    conditions.push(`o.pickup_slot_id = ANY($${params.length}::int[])`);
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      u.full_name AS customer_name,
      o.assigned_rider_id,
      o.pickup_slot_id,
      o.pickup_date,
      o.delivery_date,
      o.status,
      o.service_id,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.estimated_total,
      o.final_total,
      o.out_for_pickup_at,
      o.pickup_started_at,
      o.out_for_delivery_at,
      st.name AS service_type_name,
      ts.shift_name AS pickup_shift_name,
      ir.issue_type AS open_issue_type,
      oc.reason_type AS cancel_reason_type
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
    ${ORDER_ZONE_JOINS}
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
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

const resolveShiftLabel = (shiftName) => {
  if (!shiftName) return null;
  const normalized = String(shiftName).trim();
  return /shift/i.test(normalized) ? normalized : `${normalized} Shift`;
};

const resolveAvatarType = (rider) => {
  if (rider.image) return 'photo';
  const vehicle = String(rider.vehicle_type || '').toLowerCase();
  if (vehicle.includes('truck') || vehicle.includes('van')) return 'truck';
  return 'scooter';
};

const buildBatchStatusLabel = (status) => {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'In Progress';
  return null;
};

const buildRiderBatch = (orders, lotCode) => {
  if (!orders.length) return null;

  const total = orders.length;
  const successful = orders.filter((o) =>
    PICKUP_SUCCESS_STATUSES.includes(o.status),
  ).length;
  const pending = orders.filter((o) =>
    PICKUP_PENDING_STATUSES.includes(o.status),
  ).length;
  const failed = orders.filter((o) => o.status === 'cancelled').length;
  const progress = total > 0 ? Math.round(((total - pending) / total) * 100) : 0;
  const status = pending === 0 ? 'completed' : 'in_progress';

  return {
    lot: lotCode,
    status,
    status_label: buildBatchStatusLabel(status),
    order_count: total,
    pickups: {
      total,
      successful,
      pending,
      failed,
    },
    progress,
  };
};

const formatPhone = (mobile) => {
  if (!mobile) return 'N/A';
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile;
};

const parsePhoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
};

const pickString = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  if (trimmed === '' || /^n\/?a$/i.test(trimmed)) return fallback;
  return trimmed;
};

/** Optional field: use provided value (incl. empty → null); omit keeps existing on update. */
const pickOptionalString = (raw, existing, { isUpdate }) => {
  if (raw === undefined) return isUpdate ? (existing ?? null) : null;
  return pickString(raw);
};

const validateRequiredRiderFields = (payload = {}) => {
  if (!payload.full_name) {
    throw { status: 400, message: 'full_name is required in profile or rider_details' };
  }
  if (!payload.mobile_number) {
    throw {
      status: 400,
      message: 'A valid 10-digit phone number is required in profile or rider_details',
    };
  }
  if (!payload.account_holder_name) {
    throw { status: 400, message: 'banking_details.account_holder is required' };
  }
  if (!payload.bank_name) {
    throw { status: 400, message: 'banking_details.bank is required' };
  }
  if (!payload.account_number) {
    throw { status: 400, message: 'banking_details.account_number is required' };
  }
  if (!payload.ifsc_code) {
    throw { status: 400, message: 'banking_details.ifsc_code is required' };
  }
};

const parseDateField = (value, fieldName) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw { status: 400, message: `${fieldName} must be a valid date` };
  }
  return formatDate(date);
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return 'N/A';
  const digits = String(accountNumber).replace(/\s/g, '');
  return `XXXX XXXX ${digits.slice(-4)}`;
};

const maskAadharNumber = (aadhar) => {
  if (!aadhar) return 'N/A';
  const digits = String(aadhar).replace(/\D/g, '');
  if (digits.length < 4) return 'N/A';
  return `XXXX XXXX ${digits.slice(-4)}`;
};

const normalizeAccountNumber = (value, { allowMasked = false, existing = null } = {}) => {
  if (!value) return null;
  const str = String(value).trim();
  if (/X/i.test(str)) {
    if (allowMasked && existing) return existing;
    throw {
      status: 400,
      message: 'account_number must be the full account number, not masked',
    };
  }
  return str.replace(/\s/g, '');
};

const normalizeAadharNumber = (value, { allowMasked = false, existing = null } = {}) => {
  if (!value) return null;
  const str = String(value).trim();
  if (/X/i.test(str)) {
    if (allowMasked && existing) return existing;
    throw {
      status: 400,
      message: 'aadhar_number must be the full 12-digit number, not masked',
    };
  }
  return str.replace(/\s/g, '');
};

const resolveRiderActiveStatus = (body, existingIsActive) => {
  const status = pickString(body.status)?.toLowerCase()
    || pickString(body.profile?.status)?.toLowerCase();
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  return existingIsActive;
};

const buildDetailKeyValue = (key, value) => ({
  key,
  value: (value != null && String(value).trim() !== '' && !/^n\/?a$/i.test(String(value).trim()))
    ? String(value)
    : null,
});

const formatDisplayDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateLabel = (dateStr) => {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

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

const normalizeRiderOrderStatusFilter = (status) => {
  if (!status) return null;
  if (status === 'in_progress') return 'in_process';
  if (status === 'ready_for_dispatch') return 'ready_for_delivery';
  return status;
};

const resolveRiderOrderFilters = (query = {}) => {
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
      orderStatus: normalizeRiderOrderStatusFilter(query.order_status),
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'week';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    orderStatus: normalizeRiderOrderStatusFilter(query.order_status),
  };
};

const formatRevenue = (amount) => {
  const value = Math.round(Number(amount || 0));
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
};

const formatScheduleForProfile = (schedule = []) =>
  schedule.map((entry) => ({
    id: String(entry.id),
    pincode_group_id: String(entry.pincode_group_id),
    group_code: entry.group_code,
    group_name: entry.group_name,
    city_id: entry.city_id != null ? Number(entry.city_id) : null,
    day_of_week: entry.day_of_week,
    day_label: entry.day_label,
    shift_id: String(entry.shift_id),
    shift_name: entry.shift_name,
    start_time: entry.start_time,
    end_time: entry.end_time,
  }));

const buildRiderOrderBatch = (orders, lotCode) => {
  const total = orders.length;
  const successful = orders.filter((o) =>
    PICKUP_SUCCESS_STATUSES.includes(o.status),
  ).length;
  const pending = orders.filter((o) =>
    PICKUP_PENDING_STATUSES.includes(o.status),
  ).length;
  const failed = orders.filter((o) => o.status === 'cancelled').length;
  const progress = total > 0 ? Math.round(((total - pending) / total) * 100) : 0;
  const status = pending === 0 && total > 0 ? 'completed' : 'in_progress';

  return {
    lot: lotCode,
    status,
    status_label: buildBatchStatusLabel(status),
    order_count: total,
    pickups: {
      total,
      successful,
      pending,
      failed,
    },
    progress_label: status === 'completed' ? 'Progress' : 'Utilization',
    progress,
  };
};

const mapRiderPayload = (body = {}, { isUpdate = false, existing = null } = {}) => {
  const {
    profile = {},
    rider_details: details = {},
    vehicle_details: vehicle = {},
    banking_details: banking = {},
  } = body;

  const mobile_number =
    parsePhoneDigits(details.phone || profile.phone)
    || (isUpdate ? existing?.mobile_number : null);

  if (!mobile_number) {
    throw {
      status: 400,
      message: 'A valid 10-digit phone number is required in profile or rider_details',
    };
  }

  const full_name =
    pickString(details.full_name)
    || pickString(profile.name)
    || (isUpdate ? existing?.full_name : null);

  if (!full_name) {
    throw { status: 400, message: 'full_name is required in profile or rider_details' };
  }

  const aadharRaw =
    details.aadhar_number !== undefined || details.aadhaar_number !== undefined
      ? pickString(details.aadhar_number || details.aadhaar_number)
      : undefined;

  const aadhaar_number =
    aadharRaw !== undefined
      ? normalizeAadharNumber(aadharRaw, {
          allowMasked: isUpdate,
          existing: existing?.aadhaar_number,
        })
      : (isUpdate ? existing?.aadhaar_number : null);

  if (aadhaar_number && !AADHAR_REGEX.test(aadhaar_number)) {
    throw { status: 400, message: 'aadhar_number must be exactly 12 digits' };
  }

  const panRaw = details.pan_number;
  const pan_card_number =
    panRaw !== undefined
      ? (pickString(panRaw)?.toUpperCase() || null)
      : (isUpdate ? existing?.pan_card_number : null);

  if (pan_card_number && !PAN_REGEX.test(pan_card_number)) {
    throw { status: 400, message: 'pan_number must be in valid format (e.g. ABCDE1234F)' };
  }

  const accountNumberRaw =
    banking.account_number !== undefined ? banking.account_number : undefined;

  const account_number =
    accountNumberRaw !== undefined
      ? normalizeAccountNumber(accountNumberRaw, {
          allowMasked: isUpdate,
          existing: existing?.account_number,
        })
      : (isUpdate ? existing?.account_number : null);

  if (account_number && !ACCOUNT_NUMBER_REGEX.test(account_number)) {
    throw {
      status: 400,
      message: 'account_number must be a valid numeric bank account number (9-18 digits)',
    };
  }

  const ifscRaw = banking.ifsc_code;
  const ifsc_code =
    ifscRaw !== undefined
      ? (pickString(ifscRaw)?.toUpperCase() || null)
      : (isUpdate ? existing?.ifsc_code : null);

  if (ifsc_code && !IFSC_REGEX.test(ifsc_code)) {
    throw { status: 400, message: 'ifsc_code must be a valid IFSC code' };
  }

  const joiningInput = details.joining_date;
  const joining_date =
    joiningInput !== undefined
      ? (joiningInput ? parseDateField(joiningInput, 'joining_date') : null)
      : (isUpdate ? existing?.joining_date : null);

  const validTillInput = details.valid_till;
  const licence_validity_date =
    validTillInput !== undefined
      ? (validTillInput ? parseDateField(validTillInput, 'valid_till') : null)
      : (isUpdate ? existing?.licence_validity_date : null);

  const alternateRaw = details.alternate_number;
  let alternate_contact_number;
  if (alternateRaw === undefined) {
    alternate_contact_number = isUpdate ? existing?.alternate_contact_number : null;
  } else {
    const alternateText = pickString(alternateRaw);
    if (!alternateText) {
      alternate_contact_number = null;
    } else {
      alternate_contact_number = parsePhoneDigits(alternateText);
      if (!alternate_contact_number) {
        throw {
          status: 400,
          message: 'alternate_number must be a valid 10-digit phone number when provided',
        };
      }
    }
  }

  return {
    full_name,
    mobile_number,
    zone:
      profile.zone !== undefined
        ? pickString(profile.zone)
        : (isUpdate ? existing?.zone : null),
    alternate_contact_number,
    residential_address:
      details.address !== undefined
        ? pickString(details.address)
        : (isUpdate ? existing?.residential_address : null),
    joining_date,
    aadhaar_number,
    pan_card_number,
    driving_license:
      details.driving_license !== undefined
        ? pickString(details.driving_license)
        : (isUpdate ? existing?.driving_license : null),
    licence_validity_date,
    vehicle_type:
      vehicle.vehicle_type !== undefined
        ? pickString(vehicle.vehicle_type)
        : (isUpdate ? existing?.vehicle_type : null),
    vehicle_registration_number:
      vehicle.vehicle_number !== undefined
        ? pickString(vehicle.vehicle_number)
        : (isUpdate ? existing?.vehicle_registration_number : null),
    fuel_type:
      vehicle.fuel_type !== undefined
        ? pickString(vehicle.fuel_type)
        : (isUpdate ? existing?.fuel_type : null),
    insurance_status:
      vehicle.insurance_status !== undefined
        ? pickString(vehicle.insurance_status)
        : (isUpdate ? existing?.insurance_status : null),
    account_holder_name:
      banking.account_holder !== undefined
        ? pickString(banking.account_holder)
        : (isUpdate ? existing?.account_holder_name : null),
    bank_name:
      banking.bank !== undefined
        ? pickString(banking.bank)
        : (isUpdate ? existing?.bank_name : null),
    account_number,
    ifsc_code,
    upi_id: pickOptionalString(banking.upi_id, existing?.upi_id, { isUpdate }),
    is_active: isUpdate
      ? resolveRiderActiveStatus(body, existing?.is_active)
      : true,
  };
};

const fetchRiderStats = async (riderId) => {
  const { rows } = await sql.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE status IN ('out_for_pickup', 'pickup_in_progress')
       )::int AS pickup_assigned,
       COUNT(*) FILTER (
         WHERE status IN ('picked_up', 'in_process', 'order_finalized', 'ready_for_delivery', 'out_for_delivery', 'delivered')
       )::int AS pickup_completed,
       COUNT(*) FILTER (
         WHERE status IN ('ready_for_delivery', 'out_for_delivery')
       )::int AS delivery_assigned,
       COUNT(*) FILTER (
         WHERE status = 'delivered'
       )::int AS delivery_completed
     FROM orders
     WHERE assigned_rider_id = $1`,
    [riderId],
  );

  const stats = rows[0] || {};
  return {
    pickups: {
      assigned: Number(stats.pickup_assigned || 0),
      completed: Number(stats.pickup_completed || 0),
    },
    deliveries: {
      assigned: Number(stats.delivery_assigned || 0),
      completed: Number(stats.delivery_completed || 0),
    },
  };
};

const buildRiderDetailResponse = (rider, riderSchedule = [], stats = null) => ({
  id: rider.id,
  rider_id: formatRiderId(rider.id),
  profile: {
    name: rider.full_name || null,
    zone: rider.zone || null,
    phone: formatPhone(rider.mobile_number),
  },
  rider_details: {
    full_name: rider.full_name || null,
    phone: formatPhone(rider.mobile_number),
    alternate_number: rider.alternate_contact_number
      ? formatPhone(rider.alternate_contact_number)
      : null,
    address: rider.residential_address || null,
    joining_date: rider.joining_date || null,
    aadhar_number: rider.aadhaar_number || null,
    pan_number: rider.pan_card_number || null,
    driving_license: rider.driving_license || null,
    valid_till: rider.licence_validity_date || null,
  },
  rider_schedule: riderSchedule,
  vehicle_details: {
    vehicle_type: rider.vehicle_type || null,
    vehicle_number: rider.vehicle_registration_number || null,
    fuel_type: rider.fuel_type || null,
    insurance_status: rider.insurance_status || null,
  },
  banking_details: {
    account_holder: rider.account_holder_name || null,
    bank: rider.bank_name || null,
    account_number: maskAccountNumber(rider.account_number),
    ifsc_code: rider.ifsc_code || null,
    upi_id: rider.upi_id || null,
  },
  stats: stats || {
    pickups: { assigned: 0, completed: 0 },
    deliveries: { assigned: 0, completed: 0 },
  },
  status: rider.status,
  is_active: rider.is_active,
});

const fetchRiderById = async (riderId) => {
  const { rows } = await sql.query(`SELECT * FROM riders WHERE id = $1`, [riderId]);
  return rows[0] || null;
};

const fetchRiderWithShift = async (riderId) => {
  const { rows } = await sql.query(
    `
    SELECT
      r.*,
      COALESCE(s.shift_name, rs.shift_name) AS shift_name
    FROM riders r
    LEFT JOIN shifts s ON s.id = r.shift_id
    LEFT JOIN LATERAL (
      SELECT sh.shift_name
      FROM rider_group_shift_schedule rgss
      JOIN shifts sh ON sh.id = rgss.shift_id
      WHERE rgss.rider_id = r.id
      ORDER BY rgss.id DESC
      LIMIT 1
    ) rs ON TRUE
    WHERE r.id = $1
    `,
    [riderId],
  );

  return rows[0] || null;
};

const fetchRiderProfileStats = async (riderId) => {
  const pendingStatuses = [
    ...PICKUP_PENDING_STATUSES,
    'ready_for_delivery',
    'out_for_delivery',
  ];

  const { rows } = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status IN ('out_for_pickup', 'pickup_in_progress')
      )::int AS pickup_assigned,
      COUNT(*) FILTER (
        WHERE status = ANY($2::text[])
      )::int AS pickup_completed,
      COUNT(*) FILTER (
        WHERE status IN ('ready_for_delivery', 'out_for_delivery')
      )::int AS delivery_assigned,
      COUNT(*) FILTER (
        WHERE status = 'delivered'
      )::int AS delivery_completed,
      COUNT(*) FILTER (
        WHERE status = ANY($3::text[])
      )::int AS pending_tasks,
      COALESCE(SUM(final_total) FILTER (
        WHERE status IN ('ready_for_delivery', 'out_for_delivery', 'delivered')
      ), 0) AS revenue
    FROM orders
    WHERE assigned_rider_id = $1
    `,
    [riderId, PICKUP_SUCCESS_STATUSES, pendingStatuses],
  );

  const stats = rows[0] || {};

  return {
    pickups: {
      assigned: Number(stats.pickup_assigned || 0),
      completed: Number(stats.pickup_completed || 0),
    },
    deliveries: {
      assigned: Number(stats.delivery_assigned || 0),
      completed: Number(stats.delivery_completed || 0),
    },
    pending_tasks: Number(stats.pending_tasks || 0),
    revenue: formatRevenue(stats.revenue),
  };
};

const buildAdminRiderProfileResponse = (rider, riderSchedule = [], stats = null) => {
  const zoneMeta = resolveRiderZoneMeta(riderSchedule);

  return {
    id: String(rider.id),
    rider_id: formatRiderId(rider.id),
    name: rider.full_name || 'N/A',
    contact: formatPhone(rider.mobile_number),
    status: formatRiderStatus(rider.is_active),
    zone: zoneMeta.zone_name || rider.zone || null,
    zone_id: zoneMeta.zone_id,
    zone_code: zoneMeta.zone_code,
    zone_name: zoneMeta.zone_name || rider.zone || null,
    shift: {
      label: resolveShiftLabel(rider.shift_name),
      type: resolveShiftKey(rider.shift_name),
      zone: zoneMeta.zone_name || rider.zone || null,
    },
    rider_schedule: formatScheduleForProfile(riderSchedule),
    rider_details: [
      buildDetailKeyValue('full_name', rider.full_name),
      buildDetailKeyValue('phone', formatPhone(rider.mobile_number)),
      buildDetailKeyValue(
        'alternate_number',
        rider.alternate_contact_number
          ? formatPhone(rider.alternate_contact_number)
          : null,
      ),
      buildDetailKeyValue('address', rider.residential_address),
      buildDetailKeyValue('joining_date', formatDisplayDate(rider.joining_date)),
      buildDetailKeyValue('aadhar_number', maskAadharNumber(rider.aadhaar_number)),
      buildDetailKeyValue('pan_number', rider.pan_card_number),
      buildDetailKeyValue('driving_license', rider.driving_license),
      buildDetailKeyValue('valid_till', formatDisplayDate(rider.licence_validity_date)),
    ],
    vehicle_details: [
      buildDetailKeyValue('vehicle_type', rider.vehicle_type),
      buildDetailKeyValue('vehicle_number', rider.vehicle_registration_number),
      buildDetailKeyValue('fuel_type', rider.fuel_type),
      buildDetailKeyValue('insurance_status', rider.insurance_status),
    ],
    banking_details: [
      buildDetailKeyValue('account_holder', rider.account_holder_name),
      buildDetailKeyValue('bank', rider.bank_name),
      buildDetailKeyValue('account_number', maskAccountNumber(rider.account_number)),
      buildDetailKeyValue('ifsc_code', rider.ifsc_code),
      buildDetailKeyValue('upi_id', rider.upi_id),
    ],
    stats: stats || {
      pickups: { assigned: 0, completed: 0 },
      deliveries: { assigned: 0, completed: 0 },
      pending_tasks: 0,
      revenue: '0',
    },
  };
};

const fetchRiderOrders = async ({ riderId, start, end, orderStatus }) => {
  const params = [riderId, start, end];
  let statusClause = '';

  if (orderStatus) {
    params.push(orderStatus);
    statusClause = `AND o.status = $${params.length}`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.status,
      o.pickup_slot_id,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
      ts.shift_name AS pickup_shift_name
    FROM orders o
    LEFT JOIN time_slots ts ON ts.id = o.pickup_slot_id
    WHERE o.assigned_rider_id = $1
      AND o.pickup_date BETWEEN $2::date AND $3::date
      AND o.status NOT IN ('draft')
      ${statusClause}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

const fetchRiders = async (isActiveFilter) => {
  const params = [];
  let whereClause = '';

  if (isActiveFilter !== null) {
    params.push(isActiveFilter);
    whereClause = `WHERE r.is_active = $${params.length}`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      r.id,
      r.full_name,
      r.mobile_number,
      r.zone,
      r.residential_address,
      r.is_active,
      r.image,
      r.vehicle_type,
      r.shift_id,
      COALESCE(s.shift_name, rs.shift_name) AS shift_name
    FROM riders r
    LEFT JOIN shifts s ON s.id = r.shift_id
    LEFT JOIN LATERAL (
      SELECT sh.shift_name
      FROM rider_group_shift_schedule rgss
      JOIN shifts sh ON sh.id = rgss.shift_id
      WHERE rgss.rider_id = r.id
      ORDER BY rgss.id DESC
      LIMIT 1
    ) rs ON TRUE
    ${whereClause}
    ORDER BY r.id DESC
    `,
    params,
  );

  return rows;
};

const fetchRiderTodayOrders = async (riderIds) => {
  if (!riderIds.length) return [];

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.assigned_rider_id,
      o.status,
      o.pickup_slot_id
    FROM orders o
    WHERE o.assigned_rider_id = ANY($1::int[])
      AND o.pickup_date = CURRENT_DATE
      AND o.status NOT IN ('draft')
    ORDER BY o.id DESC
    `,
    [riderIds],
  );

  return rows;
};

export const getAdminRidersService = async (query = {}) => {
  const isActiveFilter = resolveRiderStatusFilter(query.status);
  const geoFilter = await resolveGeoFilters(query);
  const pincodeGroupId = geoFilter.pincode_group_id;
  const cityId = geoFilter.city_id;

  const riders = await fetchRiders(isActiveFilter);
  const riderIds = riders.map((r) => r.id);

  const todayOrders = riderIds.length
    ? await fetchRiderTodayOrders(riderIds)
    : [];

  const ordersByRider = todayOrders.reduce((acc, order) => {
    if (!acc[order.assigned_rider_id]) acc[order.assigned_rider_id] = [];
    acc[order.assigned_rider_id].push(order);
    return acc;
  }, {});

  const scheduleMap = await getShiftSchedulesForRiders(riderIds);

  const ridersList = riders
    .map((rider) => {
      const riderId = Number(rider.id);
      const shiftSchedule = scheduleMap.get(riderId) || [];

      if (
        !scheduleMatchesGeo(shiftSchedule, {
          pincodeGroupId,
          cityId,
        })
      ) {
        return null;
      }

      const zoneMeta = resolveRiderZoneMeta(shiftSchedule, { pincodeGroupId });
      const lot = formatLotCode(rider.id);
      const riderOrders =
        ordersByRider[rider.id] || ordersByRider[riderId] || [];
      const batch = rider.is_active
        ? buildRiderBatch(riderOrders, lot)
        : null;

      return {
        id: rider.id,
        rider_id: formatRiderId(rider.id),
        name: rider.full_name || 'N/A',
        shift: resolveShiftKey(rider.shift_name),
        shift_label: resolveShiftLabel(rider.shift_name),
        lot,
        zone: zoneMeta.zone_name || rider.zone || null,
        zone_id: zoneMeta.zone_id,
        zone_code: zoneMeta.zone_code,
        zone_name: zoneMeta.zone_name || rider.zone || null,
        location: rider.residential_address || null,
        contact: formatPhone(rider.mobile_number),
        status: formatRiderStatus(rider.is_active),
        avatar_type: resolveAvatarType(rider),
        rider_schedule: formatScheduleForProfile(shiftSchedule),
        batch,
      };
    })
    .filter(Boolean);

  const { items: pageRiders, pagination } = paginateArray(ridersList, query);

  return {
    filters: {
      status: query.status || null,
      pincode_group_id: geoFilter.pincode_group_id,
      zone_id: geoFilter.zone_id,
      zone_code: geoFilter.zone_code,
      zone_name: geoFilter.zone_name,
      city_id: geoFilter.city_id,
      city_name: geoFilter.city_name,
    },
    riders: pageRiders,
    pagination,
  };
};

export const getAdminRiderDetailsService = async (rawId) => {
  const riderId = parseRiderId(rawId);
  const rider = await fetchRiderWithShift(riderId);

  if (!rider) {
    throw { status: 404, message: 'Rider not found' };
  }

  const riderSchedule = await getShiftScheduleForRider(riderId);
  const stats = await fetchRiderProfileStats(riderId);

  return buildAdminRiderProfileResponse(rider, riderSchedule, stats);
};

export const getAdminRiderOrdersService = async (rawId, query = {}) => {
  const riderId = parseRiderId(rawId);
  const rider = await fetchRiderById(riderId);

  if (!rider) {
    throw { status: 404, message: 'Rider not found' };
  }

  const selectedDate =
    parseOptionalDate(query.date, 'date') || formatDate(new Date());
  const shift = parseOptionalShift(query.shift);
  const geoFilter = await resolveGeoFilters(query);
  const pincodeGroupId = geoFilter.pincode_group_id;
  const cityId = geoFilter.city_id;

  const shiftSlotIds = await resolveShiftSlotIds(shift);
  const { shiftByPickupSlot } = await getPickupShiftConfig();

  const orders = await fetchRiderScheduleOrders({
    riderIds: [riderId],
    rangeStart: selectedDate,
    rangeEnd: selectedDate,
    pincodeGroupId,
    cityId,
    shiftSlotIds,
  });

  const dayOrders = orders.filter((order) => isActiveOnDate(order, selectedDate));
  const shiftSchedule = await getShiftScheduleForRider(riderId);
  const zoneMeta = resolveRiderZoneMeta(shiftSchedule, {
    dayOfWeek: getIsoDayOfWeek(selectedDate),
    shift,
    pincodeGroupId,
  });

  return {
    rider: {
      id: Number(rider.id),
      rider_id: formatRiderId(rider.id),
      name: rider.full_name || 'N/A',
      status: formatRiderStatus(rider.is_active),
      shift: zoneMeta.shift || shift || resolveShiftKey(rider.shift_name) || null,
      zone_id: zoneMeta.zone_id,
      zone_code: zoneMeta.zone_code,
      zone_name: zoneMeta.zone_name || rider.zone || null,
    },
    filters: {
      date: selectedDate,
      shift,
      pincode_group_id: geoFilter.pincode_group_id,
      zone_id: geoFilter.zone_id,
      zone_code: geoFilter.zone_code,
      zone_name: geoFilter.zone_name,
      city_id: geoFilter.city_id,
      city_name: geoFilter.city_name,
    },
    orders: dayOrders.map((order) =>
      mapRiderOrderRow(order, selectedDate, shiftByPickupSlot),
    ),
  };
};

export const getAdminRidersOverviewService = async (query = {}) => {
  const {
    selectedDate,
    weekStart,
    dateFrom,
    dateTo,
    rangeStart,
    rangeEnd,
    shift,
  } = resolveRiderListFilters(query);

  const zoneFilter = await resolveGeoFilters(query);
  const pincodeGroupId = zoneFilter.pincode_group_id;
  const cityId = zoneFilter.city_id;
  const shiftSlotIds = await resolveShiftSlotIds(shift);
  const { pickupShiftSlotIds } = await getPickupShiftConfig();

  const riders = await fetchRiders(true);
  const riderMap = new Map(riders.map((r) => [Number(r.id), r]));
  const scheduleMap = await getShiftSchedulesForRiders(
    riders.map((r) => Number(r.id)),
  );
  const dayOfWeek = getIsoDayOfWeek(selectedDate);

  const orders = await fetchRiderScheduleOrders({
    rangeStart,
    rangeEnd,
    pincodeGroupId,
    cityId,
    shiftSlotIds,
  });

  const selectedOrders = orders.filter((order) =>
    isActiveOnDate(order, selectedDate),
  );

  const dayKpis = countDayTasks(selectedOrders, selectedDate);

  const ordersByRider = selectedOrders.reduce((acc, order) => {
    const riderId = Number(order.assigned_rider_id);
    if (!acc[riderId]) acc[riderId] = [];
    acc[riderId].push(order);
    return acc;
  }, {});

  const overviewRiders = Object.keys(ordersByRider)
    .map((riderIdRaw) => {
      const riderId = Number(riderIdRaw);
      const rider = riderMap.get(riderId);
      if (!rider) return null;

      const riderOrders = ordersByRider[riderId] || [];
      const shiftSchedule = scheduleMap.get(riderId) || [];
      const zoneMeta = resolveRiderZoneMeta(shiftSchedule, {
        dayOfWeek,
        shift,
        pincodeGroupId,
      });
      const stats = countDayTasks(riderOrders, selectedDate);

      return {
        id: Number(rider.id),
        rider_id: formatRiderId(rider.id),
        name: rider.full_name || 'N/A',
        location: rider.residential_address || rider.zone || 'N/A',
        contact: formatPhone(rider.mobile_number),
        status: formatRiderStatus(rider.is_active),
        shift:
          zoneMeta.shift
          || shift
          || resolveShiftKey(rider.shift_name)
          || null,
        zone_id: zoneMeta.zone_id,
        zone_code: zoneMeta.zone_code,
        zone_name: zoneMeta.zone_name || rider.zone || null,
        date: selectedDate,
        total_pickups: stats.total_pickups,
        pickups_completed: stats.pickups_completed,
        total_deliveries: stats.total_deliveries,
        deliveries_completed: stats.deliveries_completed,
        pending_tasks: stats.pending_tasks,
        failed_tasks: stats.failed_tasks,
        lot: buildRiderLotCode(Number(rider.id), pickupShiftSlotIds, riderOrders),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        (b.total_pickups + b.total_deliveries)
        - (a.total_pickups + a.total_deliveries)
        || a.id - b.id,
    );

  const { items: pageRiders, pagination } = paginateArray(overviewRiders, query);

  return {
    filters: {
      date: selectedDate,
      week_start: weekStart,
      date_from: dateFrom,
      date_to: dateTo,
      shift,
      pincode_group_id: zoneFilter.pincode_group_id,
      zone_id: zoneFilter.zone_id,
      zone_code: zoneFilter.zone_code,
      zone_name: zoneFilter.zone_name,
      zone_group: zoneFilter.zone_name,
      city_id: zoneFilter.city_id,
      city_name: zoneFilter.city_name,
    },
    days: buildOverviewDays(rangeStart, rangeEnd, orders),
    selected_date: selectedDate,
    kpis: {
      active_riders: overviewRiders.length,
      total_pickups: dayKpis.total_pickups,
      pickups_completed: dayKpis.pickups_completed,
      total_deliveries: dayKpis.total_deliveries,
      deliveries_completed: dayKpis.deliveries_completed,
      pending_tasks: dayKpis.pending_tasks,
      failed_tasks: dayKpis.failed_tasks,
    },
    riders: pageRiders,
    pagination,
  };
};

export const updateAdminRiderService = async (rawId, body) => {
  const riderId = parseRiderId(rawId);
  const existing = await fetchRiderById(riderId);

  if (!existing) {
    throw { status: 404, message: 'Rider not found' };
  }

  const payload = mapRiderPayload(body, { isUpdate: true, existing });
  validateRequiredRiderFields(payload);
  const scheduleUpdate = resolveRiderScheduleUpdate(body);
  if (!scheduleUpdate || scheduleUpdate.mode !== 'replace') {
    throw {
      status: 400,
      message:
        'rider_schedule is required and must contain at least one entry on update',
    };
  }

  if (payload.mobile_number !== existing.mobile_number) {
    const { rows: mobileCheck } = await sql.query(
      `SELECT id FROM riders WHERE mobile_number = $1 AND id != $2`,
      [payload.mobile_number, riderId],
    );
    if (mobileCheck.length) {
      throw { status: 400, message: 'Mobile number already exists' };
    }
  }

  const client = await sql.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
      UPDATE riders SET
        full_name = $1,
        mobile_number = $2,
        zone = $3,
        alternate_contact_number = $4,
        residential_address = $5,
        joining_date = $6::date,
        aadhaar_number = $7,
        pan_card_number = $8,
        driving_license = $9,
        licence_validity_date = $10::date,
        vehicle_type = $11,
        vehicle_registration_number = $12,
        fuel_type = $13,
        insurance_status = $14,
        account_holder_name = $15,
        bank_name = $16,
        account_number = $17,
        ifsc_code = $18,
        upi_id = $19,
        is_active = $20,
        status = CASE WHEN $20 THEN 'active' ELSE 'inactive' END,
        profile_completed = TRUE,
        updated_at = NOW()
      WHERE id = $21
      `,
      [
        payload.full_name,
        payload.mobile_number,
        payload.zone,
        payload.alternate_contact_number,
        payload.residential_address,
        payload.joining_date,
        payload.aadhaar_number,
        payload.pan_card_number,
        payload.driving_license,
        payload.licence_validity_date,
        payload.vehicle_type,
        payload.vehicle_registration_number,
        payload.fuel_type,
        payload.insurance_status,
        payload.account_holder_name,
        payload.bank_name,
        payload.account_number,
        payload.ifsc_code,
        payload.upi_id,
        payload.is_active,
        riderId,
      ],
    );

    if (scheduleUpdate?.mode === 'clear') {
      await clearShiftScheduleForRider(riderId, client);
    } else if (scheduleUpdate?.mode === 'replace') {
      await saveShiftScheduleForRider(riderId, scheduleUpdate.entries, {
        client,
        replace: true,
      });
    }

    await client.query('COMMIT');

    const rider = await fetchRiderWithShift(riderId);
    const savedSchedule = await getShiftScheduleForRider(riderId);
    const stats = await fetchRiderProfileStats(riderId);

    return buildAdminRiderProfileResponse(rider, savedSchedule, stats);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const createAdminRiderService = async (body) => {
  const payload = mapRiderPayload(body, { isUpdate: false });
  validateRequiredRiderFields(payload);
  const riderSchedule = parseRiderScheduleFromBody(body);
  if (!riderSchedule?.length) {
    throw {
      status: 400,
      message: 'rider_schedule is required and must contain at least one entry',
    };
  }

  const client = await sql.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO riders (
         full_name,
         mobile_number,
         zone,
         alternate_contact_number,
         residential_address,
         joining_date,
         aadhaar_number,
         pan_card_number,
         driving_license,
         licence_validity_date,
         vehicle_type,
         vehicle_registration_number,
         fuel_type,
         insurance_status,
         account_holder_name,
         bank_name,
         account_number,
         ifsc_code,
         upi_id,
         status,
         is_active,
         profile_completed
       ) VALUES (
         $1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10::date,
         $11, $12, $13, $14, $15, $16, $17, $18, $19,
         'active', TRUE, TRUE
       )
       RETURNING id`,
      [
        payload.full_name,
        payload.mobile_number,
        payload.zone,
        payload.alternate_contact_number,
        payload.residential_address,
        payload.joining_date,
        payload.aadhaar_number,
        payload.pan_card_number,
        payload.driving_license,
        payload.licence_validity_date,
        payload.vehicle_type,
        payload.vehicle_registration_number,
        payload.fuel_type,
        payload.insurance_status,
        payload.account_holder_name,
        payload.bank_name,
        payload.account_number,
        payload.ifsc_code,
        payload.upi_id,
      ],
    );

    const riderId = rows[0].id;

    await saveShiftScheduleForRider(riderId, riderSchedule, { client });

    await client.query('COMMIT');

    const rider = await fetchRiderById(riderId);
    const savedSchedule = await getShiftScheduleForRider(riderId);
    const stats = await fetchRiderStats(riderId);

    return buildRiderDetailResponse(rider, savedSchedule, stats);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
