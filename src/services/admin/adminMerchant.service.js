import bcrypt from 'bcrypt';
import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import {
  getShiftScheduleForLaundry,
  getShiftSchedulesForLaundries,
  parseShiftScheduleFromBody,
  resolveShiftScheduleUpdate,
  saveShiftScheduleForLaundry,
  clearShiftScheduleForLaundry,
} from '../common/laundryGroupShiftSchedule.service.js';
import { validateVendorFields } from '../../utils/vendorValidation.js';
import { resolveOpsIssueType } from '../../utils/opsIssue.util.js';
import { paginateArray } from '../../utils/pagination.util.js';

const BCRYPT_ROUNDS = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_WINDOW = 7;
const VALID_SHIFTS = ['morning', 'evening'];

const PICKUP_COMPLETED_STATUSES = [
  'picked_up',
  'in_process',
  'order_finalized',
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
];

const VENDOR_PROFILE_COLUMNS = `
  v.service_area,
  v.business_type,
  v.registration_date,
  v.washing_machines,
  v.washing_capacity_kg,
  v.dryers,
  v.iron_stations,
  v.dry_cleaning_machines,
  v.detergents_used,
  v.fabric_conditioners,
  v.special_chemicals,
  v.special_handling,
  v.quality_checks,
  v.water_supply,
  v.power_backup,
  v.upi_id,
  v.max_wash_kg,
  v.max_dry_pcs,
  v.vendor_per_kg_amount
`;

const DEFAULT_VENDOR_PER_KG_AMOUNT = 90;

const MERCHANT_WASH_CAPACITY_KG =
  Number(process.env.MERCHANT_WASH_CAPACITY_KG) || 150;
const MERCHANT_DRY_CAPACITY_PCS =
  Number(process.env.MERCHANT_DRY_CAPACITY_PCS) || 60;
const MERCHANT_BATCH_ORDER_CAPACITY =
  Number(process.env.MERCHANT_BATCH_ORDER_CAPACITY) || 18;

const VALID_PERIODS = ['today', 'week', 'month'];
const ACTIVE_VENDOR_STATUSES = [
  'picked_up',
  'in_process',
  'order_finalized',
  'ready_for_delivery',
  'out_for_delivery',
];

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
};

const formatDate = (date) => date.toLocaleDateString('en-CA');

const parseMerchantId = (raw) => {
  const match = String(raw).match(/^(?:MER-)?(\d+)$/i);
  if (!match) throw { status: 400, message: 'Invalid merchant id' };
  return parseInt(match[1], 10);
};

const formatMerchantId = (id) => `MER-${String(id).padStart(3, '0')}`;

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatMerchantStatus = (isActive) => (isActive ? 'active' : 'inactive');

const formatPhone = (mobile) => {
  if (!mobile) return 'N/A';
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile;
};

const getAvatarInitials = (name) => {
  if (!name) return 'NA';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return words[0].slice(0, 2).toUpperCase();
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return 'N/A';
  const digits = String(accountNumber).replace(/\s/g, '');
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
};

const formatRegistrationDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatRevenue = (amount) => {
  const value = Math.round(Number(amount || 0));
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
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

const resolveOrderFilters = (query = {}) => {
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
      orderStatus: normalizeOrderStatusFilter(query.order_status),
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    orderStatus: normalizeOrderStatusFilter(query.order_status),
  };
};

const normalizeOrderStatusFilter = (status) => {
  if (!status) return null;
  if (status === 'in_progress') return 'in_process';
  return status;
};

const hasConfirmedClothes = (order) => {
  const count = order.actual_clothes_count;
  return count != null && Number(count) > 0;
};

const hasConfirmedWeight = (order) =>
  order.actual_weight != null && Number(order.actual_weight) > 0;

const isClassificationPending = (order) => {
  if (order.status === 'picked_up') return true;
  if (order.status !== 'in_process') return false;

  if (Number(order.service_id) === 2) {
    return !hasConfirmedClothes(order);
  }

  return !hasConfirmedWeight(order) || !hasConfirmedClothes(order);
};

const isExpressOrder = (serviceTypeName) =>
  typeof serviceTypeName === 'string' &&
  serviceTypeName.toLowerCase().includes('express');

const getEstimatedKg = (min, max) => {
  const weightMin = Number(min || 0);
  const weightMax = Number(max || 0);
  if (weightMin && weightMax) {
    return parseFloat(((weightMin + weightMax) / 2).toFixed(1));
  }
  return parseFloat((weightMax || weightMin || 0).toFixed(1));
};

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const getAdminDisplayStatus = (status) => {
  if (status === 'in_process') return 'in_processing';
  return status;
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
  const isWash = Number(order.service_id) === 1;

  if (isWash) {
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

const resolveShiftKey = (shiftName) => {
  if (!shiftName) return null;
  return String(shiftName).trim().toLowerCase().split(/\s+/)[0];
};

const toDateStr = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
};

const addDays = (dateStr, days) => {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDate(date);
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

const parseOptionalPincodeGroupId = (value) => {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: 'pincode_group_id must be a positive integer' };
  }
  return id;
};

const parseOptionalShift = (value) => {
  if (value == null || value === '') return null;
  const shift = String(value).trim().toLowerCase();
  if (!VALID_SHIFTS.includes(shift)) {
    throw { status: 400, message: 'shift must be morning or evening' };
  }
  return shift;
};

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

const isDeliveryOnDate = (order, dateStr) =>
  toDateStr(order.delivery_date) === dateStr;

const resolveMerchantZoneMeta = (
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
    return { zone_id: null, zone_name: null, shift: shift || null };
  }

  return {
    zone_id: entry.pincode_group_id ?? null,
    zone_name: entry.group_name || entry.group_code || null,
    shift: resolveShiftKey(entry.shift_name) || shift || null,
  };
};

const resolveShiftSlotIds = async (shift) => {
  if (!shift) return null;
  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();
  return pickupShiftSlotIds.filter(
    (slotId) => resolveShiftKey(shiftByPickupSlot[slotId]?.shift_type) === shift,
  );
};

const resolvePincodeGroupName = async (pincodeGroupId) => {
  if (pincodeGroupId == null) return null;
  const { rows } = await sql.query(
    `SELECT id, name FROM pincode_groups WHERE id = $1`,
    [pincodeGroupId],
  );
  if (!rows.length) {
    throw { status: 404, message: 'pincode_group_id not found' };
  }
  return rows[0].name;
};

const resolveMerchantListFilters = (query = {}) => {
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
    pincodeGroupId: parseOptionalPincodeGroupId(query.pincode_group_id),
  };
};

const mapMerchantOrder = (order, selectedDate, shiftByPickupSlot = {}) => {
  const shiftMeta = shiftByPickupSlot[order.pickup_slot_id];
  const shift = resolveShiftKey(shiftMeta?.shift_type || order.pickup_shift_name);

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
    scheduled_date: toDateStr(order.delivery_date) || selectedDate,
  };
};

const buildMerchantLotCode = (vendorId, pickupShiftSlotIds, orders = []) => {
  const slotId = orders
    .map((o) => Number(o.pickup_slot_id))
    .find((id) => pickupShiftSlotIds.includes(id));
  const batchIndex =
    slotId != null ? Math.max(0, pickupShiftSlotIds.indexOf(slotId)) : 0;

  return `LOT-${String(vendorId).padStart(3, '0')}-${String(batchIndex + 1).padStart(2, '0')}`;
};

const countInProcessing = (orders) =>
  orders.filter(
    (o) =>
      o.status === 'order_finalized' ||
      (o.status === 'in_process' && !isClassificationPending(o)),
  ).length;

const countReadyForDispatch = (orders) =>
  orders.filter((o) =>
    ['ready_for_delivery', 'out_for_delivery'].includes(o.status),
  ).length;

const buildOverviewKpis = (orders) => ({
  total_orders: orders.length,
  total_kg: Math.round(getWashLoadKg(orders)),
  total_pieces: Math.round(getOrderPieces(orders)),
  pending_backlog: orders.filter(isClassificationPending).length,
  in_processing: countInProcessing(orders),
  ready_for_dispatch: countReadyForDispatch(orders),
});

const buildOverviewDays = (rangeStart, rangeEnd, orders) => {
  const days = [];
  let date = rangeStart;

  while (date <= rangeEnd) {
    days.push({
      date,
      total_orders: orders.filter((o) => isDeliveryOnDate(o, date)).length,
    });
    date = addDays(date, 1);
  }

  return days;
};

const fetchMerchantScheduleOrders = async ({
  vendorIds = null,
  rangeStart,
  rangeEnd,
  pincodeGroupId = null,
  shiftSlotIds = null,
}) => {
  const params = [rangeStart, rangeEnd, pincodeGroupId];
  const conditions = [
    `o.vendor_id IS NOT NULL`,
    `o.status NOT IN ('draft', 'cancelled')`,
    `o.delivery_date BETWEEN $1::date AND $2::date`,
    `($3::int IS NULL OR p.pincode_group_id = $3::int)`,
  ];

  if (vendorIds?.length) {
    params.push(vendorIds);
    conditions.push(`o.vendor_id = ANY($${params.length}::int[])`);
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
      o.vendor_id,
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
    LEFT JOIN user_address_details uad ON uad.id = o.address_id
    LEFT JOIN pincodes p ON p.pincode = uad.pincode
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

const getWashLoadKg = (orders) =>
  orders
    .filter((o) => Number(o.service_id) === 1)
    .reduce((sum, o) => {
      const weight =
        o.actual_weight != null
          ? Number(o.actual_weight)
          : getEstimatedKg(o.estimated_weight_min, o.estimated_weight_max);
      return sum + weight;
    }, 0);

const getOrderPieces = (orders) =>
  orders.reduce(
    (sum, o) => sum + Number(o.actual_clothes_count || 0),
    0,
  );

const buildWorkloads = (orders) => {
  const washOrders = orders.filter((o) => Number(o.service_id) === 1);
  const dryOrders = orders.filter((o) => Number(o.service_id) === 2);
  const workloads = [];

  if (washOrders.length) {
    const kg = Math.round(getWashLoadKg(washOrders));
    workloads.push({
      key: 'wash_by_kilo',
      value: `${kg} kg | ${washOrders.length} orders`,
    });
  }

  if (dryOrders.length) {
    const pcs = Math.round(getOrderPieces(dryOrders));
    workloads.push({
      key: 'dry_clean',
      value: `${pcs} pcs | ${dryOrders.length} orders`,
    });
  }

  return workloads;
};

const buildBatchUtilization = (orders) => {
  if (!orders.length) return 0;
  return Math.min(
    100,
    Math.round((orders.length / MERCHANT_BATCH_ORDER_CAPACITY) * 100),
  );
};

const buildBatchPayload = (orders, lotCode) => ({
  lot: lotCode,
  status: orders.some((o) => o.status === 'delivered') ? 'completed' : 'in_progress',
  workloads: buildWorkloads(orders),
  order_count: orders.length,
  utilization: buildBatchUtilization(orders),
});

const resolveVendorStatusFilter = (status) => {
  if (!status || status === 'all') return null;
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  throw { status: 400, message: 'status must be active or inactive' };
};

const fetchVendors = async (isActiveFilter) => {
  const params = [];
  let whereClause = '';

  if (isActiveFilter !== null) {
    params.push(isActiveFilter);
    whereClause = `WHERE v.is_active = $${params.length}`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      v.id,
      v.laundry_shop_name,
      v.shop_address,
      v.mobile_number,
      v.is_active
    FROM vendors v
    ${whereClause}
    ORDER BY v.id DESC
    `,
    params,
  );

  return rows;
};

const fetchVendorById = async (vendorId) => {
  const { rows } = await sql.query(
    `
    SELECT
      v.id,
      v.owner_contact_name,
      v.mobile_number,
      v.email,
      v.aadhar_number,
      v.laundry_shop_name,
      v.shop_address,
      v.gst_number,
      v.pan_card_number,
      v.account_holder_name,
      v.bank_name,
      v.account_number,
      v.ifsc_code,
      v.is_active,
      v.created_at,
      ${VENDOR_PROFILE_COLUMNS}
    FROM vendors v
    WHERE v.id = $1
    `,
    [vendorId],
  );

  return rows[0] || null;
};

const fetchMerchantOrders = async ({
  vendorIds = null,
  start = null,
  end = null,
  orderStatus = null,
  pipelineOnly = false,
}) => {
  const params = [];
  const conditions = [`o.vendor_id IS NOT NULL`, `o.status NOT IN ('draft', 'cancelled')`];

  if (vendorIds?.length) {
    params.push(vendorIds);
    conditions.push(`o.vendor_id = ANY($${params.length}::int[])`);
  }

  if (start && end) {
    params.push(start, end);
    conditions.push(
      `o.vendor_received_at IS NOT NULL AND o.vendor_received_at::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`,
    );
  }

  if (pipelineOnly) {
    conditions.push(`o.status = ANY($${params.length + 1}::text[])`);
    params.push(ACTIVE_VENDOR_STATUSES);
  }

  if (orderStatus) {
    params.push(orderStatus);
    conditions.push(`o.status = $${params.length}`);
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.vendor_id,
      o.pickup_slot_id,
      o.status,
      o.service_id,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.estimated_total,
      o.final_total,
      o.vendor_received_at,
      TO_CHAR(o.vendor_received_at::date, 'YYYY-MM-DD') AS vendor_received_date,
      st.name AS service_type_name,
      ts.shift_name AS pickup_shift_name,
      ir.issue_type AS open_issue_type
    FROM orders o
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
    LEFT JOIN LATERAL (
      SELECT issue_type
      FROM order_reports
      WHERE order_id = o.id AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    ) ir ON TRUE
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

const buildMerchantBatches = (orders, pickupShiftSlotIds) => {
  const batches = [];
  const slotIdsWithOrders = [
    ...new Set(
      orders
        .map((o) => Number(o.pickup_slot_id))
        .filter((id) => pickupShiftSlotIds.includes(id)),
    ),
  ];

  slotIdsWithOrders.forEach((slotId) => {
    const slotOrders = orders.filter(
      (o) => Number(o.pickup_slot_id) === Number(slotId),
    );
    if (!slotOrders.length) return;

    const lotIndex = pickupShiftSlotIds.indexOf(Number(slotId));
    const lotCode = `LOT-${String(lotIndex + 1).padStart(3, '0')}`;
    batches.push(buildBatchPayload(slotOrders, lotCode));
  });

  return batches;
};

const buildTopStats = (orders) => {
  const pipelineOrders = orders.filter((o) =>
    ACTIVE_VENDOR_STATUSES.includes(o.status),
  );
  const washKg = Math.round(getWashLoadKg(pipelineOrders));
  const dryPcs = Math.round(
    getOrderPieces(pipelineOrders.filter((o) => Number(o.service_id) === 2)),
  );

  return [
    { key: 'total_laundry_kg', value: `${washKg} kg` },
    { key: 'dry_clean_pieces', value: `${dryPcs} pcs` },
    {
      key: 'orders_in_processing',
      value: String(
        pipelineOrders.filter(
          (o) =>
            o.status === 'order_finalized' ||
            (o.status === 'in_process' && !isClassificationPending(o)),
        ).length,
      ),
    },
    {
      key: 'ready_for_dispatch',
      value: String(
        pipelineOrders.filter((o) =>
          ['ready_for_delivery', 'out_for_delivery'].includes(o.status),
        ).length,
      ),
    },
    {
      key: 'pending_backlog',
      value: String(pipelineOrders.filter(isClassificationPending).length),
    },
    {
      key: 'order_completed',
      value: String(orders.filter((o) => o.status === 'delivered').length),
    },
  ];
};

const buildDetailKeyValue = (key, value) => ({
  key,
  value: value != null && String(value).trim() !== '' ? String(value) : 'N/A',
});

const summarizeShiftScheduleLocation = (shiftSchedule = []) => {
  const groupNames = [
    ...new Set(
      shiftSchedule
        .map((entry) => entry.group_name || entry.group_code)
        .filter(Boolean),
    ),
  ];

  return groupNames.length ? groupNames.join(', ') : null;
};

const parsePhoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
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

const pickString = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  return trimmed !== '' ? trimmed : fallback;
};

const resolveMerchantStatus = (body, existingIsActive) => {
  const status = pickString(body.status)?.toLowerCase()
    || pickString(body.profile?.status)?.toLowerCase();
  if (status === 'active') return true;
  if (status === 'inactive') return false;
  return existingIsActive;
};

const parseRegistrationDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw {
      status: 400,
      message: 'registration_date must be a valid date (e.g. 11 Jun 2026)',
    };
  }
  return formatDate(date);
};

const resolveVendorPerKgAmount = (rawValue, existingValue, { isUpdate }) => {
  const source =
    rawValue !== undefined && rawValue !== null && rawValue !== ''
      ? rawValue
      : isUpdate
        ? existingValue
        : DEFAULT_VENDOR_PER_KG_AMOUNT;

  const amount = Number(source);
  if (Number.isNaN(amount) || amount < 0) {
    throw { status: 400, message: 'vendor_per_kg_amount must be a non-negative number' };
  }
  return parseFloat(amount.toFixed(2));
};

const mapMerchantPayload = (body = {}, { isUpdate = false, existing = null } = {}) => {
  const {
    profile = {},
    business_details: business = {},
    equipment_details: equipment = {},
    banking_details: banking = {},
    capacity = {},
  } = body;

  const laundry_shop_name =
    pickString(business.business_name)
    || pickString(profile.name)
    || (isUpdate ? existing?.laundry_shop_name : null);
  const owner_contact_name =
    pickString(business.owner_name)
    || (isUpdate ? existing?.owner_contact_name : null);
  const shop_address =
    pickString(business.address)
    || pickString(profile.address)
    || (isUpdate ? existing?.shop_address : null);
  const mobile_number =
    parsePhoneDigits(business.phone || profile.phone)
    || (isUpdate ? existing?.mobile_number : null);

  if (!mobile_number) {
    throw {
      status: 400,
      message: 'A valid 10-digit phone number is required in profile or business_details',
    };
  }

  const email =
    pickString(business.email)?.toLowerCase()
    || (isUpdate ? existing?.email : null);

  const accountNumberRaw =
    banking.account_number !== undefined ? banking.account_number : undefined;
  const account_number =
    accountNumberRaw !== undefined
      ? normalizeAccountNumber(accountNumberRaw, {
          allowMasked: isUpdate,
          existing: existing?.account_number,
        })
      : (isUpdate ? existing?.account_number : null);

  const dbFields = {
    owner_contact_name,
    mobile_number,
    email,
    aadhar_number:
      pickString(business.aadhar_number)
      || pickString(business.aadhaar_number)
      || (isUpdate ? existing?.aadhar_number : null),
    pan_card_number:
      pickString(business.pan_number)
      || (isUpdate ? existing?.pan_card_number : null),
    gst_number:
      pickString(business.gstin)
      || pickString(business.gst_number)
      || (isUpdate ? existing?.gst_number : null),
    laundry_shop_name,
    shop_address,
    account_holder_name:
      pickString(banking.account_holder)
      || (isUpdate ? existing?.account_holder_name : null),
    bank_name:
      pickString(banking.bank)
      || (isUpdate ? existing?.bank_name : null),
    account_number,
    ifsc_code:
      pickString(banking.ifsc_code)
      || (isUpdate ? existing?.ifsc_code : null),
  };

  validateVendorFields(dbFields, { partial: false });

  const password =
    pickString(business.password)
    || pickString(body.password)
    || pickString(profile.password);

  if (!isUpdate && (!password || password.length < 6)) {
    throw {
      status: 400,
      message: 'password is required and must be at least 6 characters',
    };
  }

  if (isUpdate && password && password.length < 6) {
    throw {
      status: 400,
      message: 'password must be at least 6 characters',
    };
  }

  const registrationInput = business.registration_date;
  const registration_date =
    registrationInput !== undefined
      ? (registrationInput ? parseRegistrationDate(registrationInput) : null)
      : (isUpdate ? existing?.registration_date : null);

  return {
    ...dbFields,
    password: password || null,
    pan_card_number: dbFields.pan_card_number?.toUpperCase?.() || null,
    gst_number: dbFields.gst_number?.toUpperCase?.() || null,
    ifsc_code: dbFields.ifsc_code?.toUpperCase?.() || null,
    service_area:
      pickString(business.service_area)
      || pickString(business.service_areas)
      || (isUpdate ? existing?.service_area : null),
    business_type:
      pickString(business.business_type)
      || (isUpdate ? existing?.business_type : null),
    registration_date,
    washing_machines:
      pickString(equipment.washing_machines)
      || (isUpdate ? existing?.washing_machines : null),
    washing_capacity_kg:
      pickString(equipment.washing_capacity_kg)
      || (isUpdate ? existing?.washing_capacity_kg : null),
    dryers:
      pickString(equipment.dryers)
      || (isUpdate ? existing?.dryers : null),
    iron_stations:
      pickString(equipment.iron_stations)
      || (isUpdate ? existing?.iron_stations : null),
    dry_cleaning_machines:
      pickString(equipment.dry_cleaning_machines)
      || (isUpdate ? existing?.dry_cleaning_machines : null),
    detergents_used:
      pickString(equipment.detergents_used)
      || (isUpdate ? existing?.detergents_used : null),
    fabric_conditioners:
      pickString(equipment.fabric_conditioners)
      || (isUpdate ? existing?.fabric_conditioners : null),
    special_chemicals:
      pickString(equipment.special_chemicals)
      || (isUpdate ? existing?.special_chemicals : null),
    special_handling:
      pickString(equipment.special_handling)
      || (isUpdate ? existing?.special_handling : null),
    quality_checks:
      pickString(equipment.quality_checks)
      || (isUpdate ? existing?.quality_checks : null),
    water_supply:
      pickString(equipment.water_supply)
      || (isUpdate ? existing?.water_supply : null),
    power_backup:
      pickString(equipment.power_backup)
      || (isUpdate ? existing?.power_backup : null),
    upi_id:
      pickString(banking.upi_id)
      || (isUpdate ? existing?.upi_id : null),
    max_wash_kg:
      capacity.max_wash_kg != null
        ? Number(capacity.max_wash_kg)
        : isUpdate
          ? Number(existing?.max_wash_kg ?? MERCHANT_WASH_CAPACITY_KG)
          : MERCHANT_WASH_CAPACITY_KG,
    max_dry_pcs:
      capacity.max_dry_pcs != null
        ? parseInt(capacity.max_dry_pcs, 10)
        : isUpdate
          ? Number(existing?.max_dry_pcs ?? MERCHANT_DRY_CAPACITY_PCS)
          : MERCHANT_DRY_CAPACITY_PCS,
    vendor_per_kg_amount: resolveVendorPerKgAmount(
      body.vendor_per_kg_amount ?? business.vendor_per_kg_amount ?? capacity.vendor_per_kg_amount,
      existing?.vendor_per_kg_amount,
      { isUpdate },
    ),
    is_active: isUpdate
      ? resolveMerchantStatus(body, existing?.is_active)
      : true,
  };
};

const buildMerchantDetailResponse = (vendor, shiftSchedule = []) => ({
  id: vendor.id,
  merchant_id: formatMerchantId(vendor.id),
  name: vendor.laundry_shop_name || 'N/A',
  contact: formatPhone(vendor.mobile_number),
  status: formatMerchantStatus(vendor.is_active),
  avatar_initials: getAvatarInitials(vendor.laundry_shop_name),
  address: vendor.shop_address || 'N/A',
  shift_schedule: shiftSchedule,
  business_details: [
    buildDetailKeyValue('business_name', vendor.laundry_shop_name),
    buildDetailKeyValue('owner_name', vendor.owner_contact_name),
    buildDetailKeyValue('phone', formatPhone(vendor.mobile_number)),
    buildDetailKeyValue('email', vendor.email),
    buildDetailKeyValue('address', vendor.shop_address),
    buildDetailKeyValue('aadhar_number', vendor.aadhar_number),
    buildDetailKeyValue('service_areas', vendor.service_area),
    buildDetailKeyValue('gst_number', vendor.gst_number),
    buildDetailKeyValue('pan_number', vendor.pan_card_number),
    buildDetailKeyValue('business_type', vendor.business_type),
    buildDetailKeyValue(
      'registration_date',
      vendor.registration_date
        ? formatRegistrationDate(vendor.registration_date)
        : formatRegistrationDate(vendor.created_at),
    ),
  ],
  equipment_details: [
    buildDetailKeyValue('washing_machines', vendor.washing_machines),
    buildDetailKeyValue('washing_capacity_kg', vendor.washing_capacity_kg),
    buildDetailKeyValue('dryers', vendor.dryers),
    buildDetailKeyValue('iron_stations', vendor.iron_stations),
    buildDetailKeyValue('dry_cleaning_machines', vendor.dry_cleaning_machines),
    buildDetailKeyValue('detergents_used', vendor.detergents_used),
    buildDetailKeyValue('fabric_conditioners', vendor.fabric_conditioners),
    buildDetailKeyValue('special_chemicals', vendor.special_chemicals),
    buildDetailKeyValue('special_handling', vendor.special_handling),
    buildDetailKeyValue('quality_checks', vendor.quality_checks),
    buildDetailKeyValue('water_supply', vendor.water_supply),
    buildDetailKeyValue('power_backup', vendor.power_backup),
  ],
  banking_details: [
    buildDetailKeyValue('account_holder', vendor.account_holder_name),
    buildDetailKeyValue('bank', vendor.bank_name),
    buildDetailKeyValue('account_number', maskAccountNumber(vendor.account_number)),
    buildDetailKeyValue('ifsc_code', vendor.ifsc_code),
    buildDetailKeyValue('upi_id', vendor.upi_id),
  ],
  capacity: {
    max_wash_kg: Number(vendor.max_wash_kg ?? MERCHANT_WASH_CAPACITY_KG),
    max_dry_pcs: Number(vendor.max_dry_pcs ?? MERCHANT_DRY_CAPACITY_PCS),
  },
  vendor_per_kg_amount: parseFloat(
    Number(vendor.vendor_per_kg_amount ?? DEFAULT_VENDOR_PER_KG_AMOUNT).toFixed(2),
  ),
});

export const getAdminMerchantsService = async (query = {}) => {
  const isActiveFilter = resolveVendorStatusFilter(query.status);
  const vendors = await fetchVendors(isActiveFilter);
  const vendorIds = vendors.map((v) => v.id);

  const orders = vendorIds.length
    ? await fetchMerchantOrders({ vendorIds, pipelineOnly: true })
    : [];

  const deliveredOrders = vendorIds.length
    ? await fetchMerchantOrders({
        vendorIds,
        orderStatus: 'delivered',
      })
    : [];

  const statsOrders = [...orders, ...deliveredOrders];
  const { pickupShiftSlotIds } = await getPickupShiftConfig();

  const ordersByVendor = orders.reduce((acc, order) => {
    if (!acc[order.vendor_id]) acc[order.vendor_id] = [];
    acc[order.vendor_id].push(order);
    return acc;
  }, {});

  const scheduleMap = await getShiftSchedulesForLaundries(vendorIds);

  const merchants = vendors.map((vendor) => {
    const shiftSchedule = scheduleMap.get(vendor.id) || [];

    return {
      id: vendor.id,
      merchant_id: formatMerchantId(vendor.id),
      name: vendor.laundry_shop_name || 'N/A',
      location:
        vendor.shop_address
        || summarizeShiftScheduleLocation(shiftSchedule)
        || 'N/A',
      contact: formatPhone(vendor.mobile_number),
      status: formatMerchantStatus(vendor.is_active),
      avatar_initials: getAvatarInitials(vendor.laundry_shop_name),
      shift_schedule: shiftSchedule,
      batches: buildMerchantBatches(
        ordersByVendor[vendor.id] || [],
        pickupShiftSlotIds,
      ),
    };
  });

  const { items: pageMerchants, pagination } = paginateArray(merchants, query);

  return {
    top_stats: buildTopStats(statsOrders),
    merchants: pageMerchants,
    pagination,
  };
};

export const getAdminMerchantDetailsService = async (rawId) => {
  const vendorId = parseMerchantId(rawId);
  const vendor = await fetchVendorById(vendorId);

  if (!vendor) {
    throw { status: 404, message: 'Merchant not found' };
  }

  const shiftSchedule = await getShiftScheduleForLaundry(vendorId);
  return buildMerchantDetailResponse(vendor, shiftSchedule);
};

export const createAdminMerchantService = async (body) => {
  const payload = mapMerchantPayload(body, { isUpdate: false });
  const shiftSchedule = parseShiftScheduleFromBody(body);
  const passwordHash = await bcrypt.hash(String(payload.password), BCRYPT_ROUNDS);

  const client = await sql.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      INSERT INTO vendors (
        owner_contact_name,
        mobile_number,
        email,
        password,
        aadhar_number,
        pan_card_number,
        gst_number,
        laundry_shop_name,
        shop_address,
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        service_area,
        business_type,
        registration_date,
        washing_machines,
        washing_capacity_kg,
        dryers,
        iron_stations,
        dry_cleaning_machines,
        detergents_used,
        fabric_conditioners,
        special_chemicals,
        special_handling,
        quality_checks,
        water_supply,
        power_backup,
        upi_id,
        max_wash_kg,
        max_dry_pcs,
        vendor_per_kg_amount,
        status,
        is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16::date, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
        'active', TRUE
      )
      RETURNING id
      `,
      [
        payload.owner_contact_name,
        payload.mobile_number,
        payload.email,
        passwordHash,
        payload.aadhar_number,
        payload.pan_card_number,
        payload.gst_number,
        payload.laundry_shop_name,
        payload.shop_address,
        payload.account_holder_name,
        payload.bank_name,
        payload.account_number,
        payload.ifsc_code,
        payload.service_area,
        payload.business_type,
        payload.registration_date,
        payload.washing_machines,
        payload.washing_capacity_kg,
        payload.dryers,
        payload.iron_stations,
        payload.dry_cleaning_machines,
        payload.detergents_used,
        payload.fabric_conditioners,
        payload.special_chemicals,
        payload.special_handling,
        payload.quality_checks,
        payload.water_supply,
        payload.power_backup,
        payload.upi_id,
        payload.max_wash_kg,
        payload.max_dry_pcs,
        payload.vendor_per_kg_amount,
      ],
    );

    const vendorId = rows[0].id;

    if (shiftSchedule?.length) {
      await saveShiftScheduleForLaundry(vendorId, shiftSchedule, { client });
    }

    await client.query('COMMIT');

    const vendor = await fetchVendorById(vendorId);
    const savedSchedule = await getShiftScheduleForLaundry(vendorId);
    return buildMerchantDetailResponse(vendor, savedSchedule);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const updateAdminMerchantService = async (rawId, body) => {
  const vendorId = parseMerchantId(rawId);
  const existing = await fetchVendorById(vendorId);

  if (!existing) {
    throw { status: 404, message: 'Merchant not found' };
  }

  const payload = mapMerchantPayload(body, { isUpdate: true, existing });
  const shiftScheduleUpdate = resolveShiftScheduleUpdate(body);

  if (payload.email !== existing.email) {
    const { rows: emailCheck } = await sql.query(
      `SELECT id FROM vendors WHERE LOWER(email) = $1 AND id != $2`,
      [payload.email, vendorId],
    );
    if (emailCheck.length) {
      throw { status: 400, message: 'Email already exists' };
    }
  }

  const client = await sql.connect();

  try {
    await client.query('BEGIN');

    const params = [
      payload.owner_contact_name,
      payload.mobile_number,
      payload.email,
      payload.aadhar_number,
      payload.pan_card_number,
      payload.gst_number,
      payload.laundry_shop_name,
      payload.shop_address,
      payload.account_holder_name,
      payload.bank_name,
      payload.account_number,
      payload.ifsc_code,
      payload.service_area,
      payload.business_type,
      payload.registration_date,
      payload.washing_machines,
      payload.washing_capacity_kg,
      payload.dryers,
      payload.iron_stations,
      payload.dry_cleaning_machines,
      payload.detergents_used,
      payload.fabric_conditioners,
      payload.special_chemicals,
      payload.special_handling,
      payload.quality_checks,
      payload.water_supply,
      payload.power_backup,
      payload.upi_id,
      payload.max_wash_kg,
      payload.max_dry_pcs,
      payload.vendor_per_kg_amount,
      payload.is_active,
    ];

    let passwordClause = '';
    if (payload.password) {
      const passwordHash = await bcrypt.hash(String(payload.password), BCRYPT_ROUNDS);
      passwordClause = `, password = $${params.length + 1}`;
      params.push(passwordHash);
    }

    params.push(vendorId);
    const vendorIdParam = `$${params.length}`;

    await client.query(
      `
      UPDATE vendors SET
        owner_contact_name = $1,
        mobile_number = $2,
        email = $3,
        aadhar_number = $4,
        pan_card_number = $5,
        gst_number = $6,
        laundry_shop_name = $7,
        shop_address = $8,
        account_holder_name = $9,
        bank_name = $10,
        account_number = $11,
        ifsc_code = $12,
        service_area = $13,
        business_type = $14,
        registration_date = $15::date,
        washing_machines = $16,
        washing_capacity_kg = $17,
        dryers = $18,
        iron_stations = $19,
        dry_cleaning_machines = $20,
        detergents_used = $21,
        fabric_conditioners = $22,
        special_chemicals = $23,
        special_handling = $24,
        quality_checks = $25,
        water_supply = $26,
        power_backup = $27,
        upi_id = $28,
        max_wash_kg = $29,
        max_dry_pcs = $30,
        vendor_per_kg_amount = $31,
        is_active = $32,
        status = CASE WHEN $32 THEN 'active' ELSE 'inactive' END,
        updated_at = NOW()
        ${passwordClause}
      WHERE id = ${vendorIdParam}
      `,
      params,
    );

    if (shiftScheduleUpdate?.mode === 'clear') {
      await clearShiftScheduleForLaundry(vendorId, client);
    } else if (shiftScheduleUpdate?.mode === 'replace') {
      await saveShiftScheduleForLaundry(vendorId, shiftScheduleUpdate.entries, {
        client,
        replace: true,
      });
    }

    await client.query('COMMIT');

    const vendor = await fetchVendorById(vendorId);
    const savedSchedule = await getShiftScheduleForLaundry(vendorId);
    return buildMerchantDetailResponse(vendor, savedSchedule);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const getAdminMerchantOrdersService = async (rawId, query = {}) => {
  const vendorId = parseMerchantId(rawId);
  const vendor = await fetchVendorById(vendorId);

  if (!vendor) {
    throw { status: 404, message: 'Merchant not found' };
  }

  const selectedDate =
    parseOptionalDate(query.date, 'date') || formatDate(new Date());
  const shift = parseOptionalShift(query.shift);
  const pincodeGroupId = parseOptionalPincodeGroupId(query.pincode_group_id);

  if (pincodeGroupId != null) {
    await resolvePincodeGroupName(pincodeGroupId);
  }

  const shiftSlotIds = await resolveShiftSlotIds(shift);
  const { shiftByPickupSlot } = await getPickupShiftConfig();

  const orders = await fetchMerchantScheduleOrders({
    vendorIds: [vendorId],
    rangeStart: selectedDate,
    rangeEnd: selectedDate,
    pincodeGroupId,
    shiftSlotIds,
  });

  const dayOrders = orders.filter((order) =>
    isDeliveryOnDate(order, selectedDate),
  );
  const shiftSchedule = await getShiftScheduleForLaundry(vendorId);
  const zoneMeta = resolveMerchantZoneMeta(shiftSchedule, {
    dayOfWeek: getIsoDayOfWeek(selectedDate),
    shift,
    pincodeGroupId,
  });

  return {
    merchant: {
      id: vendor.id,
      merchant_id: formatMerchantId(vendor.id),
      name: vendor.laundry_shop_name || 'N/A',
      status: formatMerchantStatus(vendor.is_active),
      shift: zoneMeta.shift || shift || null,
      zone_name: zoneMeta.zone_name,
    },
    filters: {
      date: selectedDate,
      shift,
      pincode_group_id: pincodeGroupId,
    },
    orders: dayOrders.map((order) =>
      mapMerchantOrder(order, selectedDate, shiftByPickupSlot),
    ),
  };
};

export const getAdminMerchantsOverviewService = async (query = {}) => {
  const {
    selectedDate,
    weekStart,
    dateFrom,
    dateTo,
    rangeStart,
    rangeEnd,
    shift,
    pincodeGroupId,
  } = resolveMerchantListFilters(query);

  const zoneGroup = await resolvePincodeGroupName(pincodeGroupId);
  const shiftSlotIds = await resolveShiftSlotIds(shift);
  const { pickupShiftSlotIds } = await getPickupShiftConfig();

  const vendors = await fetchVendors(true);
  const vendorMap = new Map(vendors.map((v) => [Number(v.id), v]));
  const scheduleMap = await getShiftSchedulesForLaundries(
    vendors.map((v) => Number(v.id)),
  );
  const dayOfWeek = getIsoDayOfWeek(selectedDate);

  const orders = await fetchMerchantScheduleOrders({
    rangeStart,
    rangeEnd,
    pincodeGroupId,
    shiftSlotIds,
  });

  const selectedOrders = orders.filter((order) =>
    isDeliveryOnDate(order, selectedDate),
  );

  const ordersByVendor = selectedOrders.reduce((acc, order) => {
    const vendorId = Number(order.vendor_id);
    if (!acc[vendorId]) acc[vendorId] = [];
    acc[vendorId].push(order);
    return acc;
  }, {});

  const merchants = Object.keys(ordersByVendor)
    .map((vendorIdRaw) => {
      const vendorId = Number(vendorIdRaw);
      const vendor = vendorMap.get(vendorId);
      if (!vendor) return null;

      const vendorOrders = ordersByVendor[vendorId] || [];
      const shiftSchedule = scheduleMap.get(vendorId) || [];
      const zoneMeta = resolveMerchantZoneMeta(shiftSchedule, {
        dayOfWeek,
        shift,
        pincodeGroupId,
      });

      return {
        id: Number(vendor.id),
        merchant_id: formatMerchantId(vendor.id),
        name: vendor.laundry_shop_name || 'N/A',
        location:
          vendor.shop_address
          || summarizeShiftScheduleLocation(shiftSchedule)
          || 'N/A',
        contact: formatPhone(vendor.mobile_number),
        status: formatMerchantStatus(vendor.is_active),
        shift: zoneMeta.shift || shift || null,
        zone_id: zoneMeta.zone_id,
        zone_name: zoneMeta.zone_name,
        date: selectedDate,
        total_orders: vendorOrders.length,
        total_kg: Math.round(getWashLoadKg(vendorOrders)),
        total_pieces: Math.round(getOrderPieces(vendorOrders)),
        utilization: buildBatchUtilization(vendorOrders),
        lot: buildMerchantLotCode(Number(vendor.id), pickupShiftSlotIds, vendorOrders),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.total_orders - a.total_orders || a.id - b.id);

  return {
    filters: {
      date: selectedDate,
      week_start: weekStart,
      date_from: dateFrom,
      date_to: dateTo,
      shift,
      pincode_group_id: pincodeGroupId,
      zone_group: zoneGroup,
    },
    days: buildOverviewDays(rangeStart, rangeEnd, orders),
    selected_date: selectedDate,
    kpis: buildOverviewKpis(selectedOrders),
    merchants,
  };
};
