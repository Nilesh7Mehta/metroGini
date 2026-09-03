import sql from '../../config/db.js';
import { buildOrderTimestamps, fetchOrderTimestamps, formatDateTime } from '../../utils/datetime.util.js';
import { createNotificationsBatch } from '../../utils/notificationHelper.js';
import { sendDeliveryOtpEmail, sendUserEmailSafe } from '../common/email.service.js';
import { generateOTP } from '../../utils/otp.js';
import { computeFinalTotalsForConfirmWeight } from '../../utils/orderFinalBilling.util.js';
import { resolveVendorAmountPerKg } from '../../utils/vendorPayout.util.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import { DAY_LABELS } from '../common/laundryGroupShiftSchedule.service.js';
import { paginateArray } from '../../utils/pagination.util.js';

// Orders still on the vendor's task board for a given deadline day.
// ready_for_delivery stays visible for that day (dispatch), but does not
// keep a past deadline stuck — see TASK_VENDOR_PENDING_STATUSES.
const TASK_ACTIVE_STATUSES = [
  'in_process',
  'order_finalized',
  'ready_for_delivery',
];

// Only these keep the task view pinned to a previous delivery_date.
// Once mark-ready is done, vendor work for that batch is complete.
const TASK_VENDOR_PENDING_STATUSES = ['in_process', 'order_finalized'];

const SERVICE_CONFIG = {
  1: {
    id: 'wash_by_kilo',
    type: 'Wash By Kilo',
    image: '/assets/images/wash.png',
  },
  2: {
    id: 'dry_clean',
    type: 'Dry Clean',
    image: '/assets/images/dry-clean.png',
  },
};

const hasConfirmedClothes = (order) => {
  const count = order.actual_clothes_count;
  return count != null && Number(count) > 0;
};

const hasConfirmedWeight = (order) => {
  return order.actual_weight != null && Number(order.actual_weight) > 0;
};

const parseStainEntries = (value) => {
  let list = value;

  if (typeof list === 'string' && list.trim()) {
    try {
      const parsed = JSON.parse(list);
      list = Array.isArray(parsed) ? parsed : [list];
    } catch {
      list = [list];
    }
  }

  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return { path: item.trim(), strain_size: null };
      }

      if (item && typeof item === 'object') {
        const path = String(item.path || item.url || item.image || '').trim();
        if (!path) return null;

        const rawSize = item.strain_size ?? item.strainSize ?? null;
        const strain_size =
          rawSize === 'small' || rawSize === 'big' ? rawSize : null;

        return { path, strain_size };
      }

      return null;
    })
    .filter(Boolean);
};

const normalizeStainImages = (value) => {
  const paths = parseStainEntries(value).map((entry) => entry.path);
  return paths.length ? paths : null;
};

const normalizeStainSizes = (value) =>
  parseStainEntries(value).map((entry) => entry.strain_size);

const normalizeDamageImages = (value) => {
  let list = value;

  if (typeof list === 'string' && list.trim()) {
    try {
      const parsed = JSON.parse(list);
      list = Array.isArray(parsed) ? parsed : [list];
    } catch {
      list = [list];
    }
  }

  if (!Array.isArray(list)) return null;

  const images = list
    .map((item) => {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const path = String(item.path || item.url || item.image || '').trim();
        return path || null;
      }
      return null;
    })
    .filter(Boolean);

  return images.length ? images : null;
};

/** Vendor has received the order but has not confirmed weight/piece count yet */
const isClassificationPending = (order) => {
  if (order.status !== 'in_process') return false;

  if (Number(order.service_id) === 2) {
    return !hasConfirmedClothes(order);
  }

  return !hasConfirmedWeight(order) || !hasConfirmedClothes(order);
};

const getClassificationStatus = (order) => {
  if (order.status === 'picked_up') return 'pending';
  if (isClassificationPending(order)) return 'pending';
  if (
    ['in_process', 'order_finalized', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(
      order.status,
    )
  ) {
    return 'completed';
  }
  return 'pending';
};

const getServiceDisplayImage = (serviceId, dbImage) => {
  const config = SERVICE_CONFIG[Number(serviceId)];
  return config?.image || dbImage || null;
};

const formatDisplayOrderId = (order) =>
  order.order_code || `ORD-${String(order.id).padStart(3, '0')}`;

const normalizeStatus = (status) =>
  typeof status === 'string' ? status.trim() : status;

/** Vendor-facing status aligned with dashboard operational_distribution */
const getVendorOperationalStatus = (order) => {
  const status = normalizeStatus(order.status);

  if (isClassificationPending(order)) return 'pending_classification';
  if (
    status === 'order_finalized' ||
    (status === 'in_process' && !isClassificationPending(order))
  ) {
    return 'in_processing';
  }
  // Waiting at vendor for rider pickup
  if (status === 'ready_for_delivery') return 'ready_for_dispatch';
  // Rider already took the order from vendor
  if (status === 'out_for_delivery') return 'out_for_delivery';
  if (status === 'delivered') return 'delivered';
  if (status === 'picked_up') return 'awaiting_handover';
  return status;
};

// Returns { start, end } date strings for the given filter
const formatDate = (date) =>
  date.toLocaleDateString('en-CA'); // YYYY-MM-DD

const formatGeneratedAt = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatPgDate = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return formatDate(value);
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : formatDate(new Date(raw));
};

const MONTH_SHORT_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** e.g. 2026-07-30 → "30 Jul 2026" */
const formatDisplayDay = (dateStr) => {
  const key = formatPgDate(dateStr);
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${String(d).padStart(2, '0')} ${MONTH_SHORT_LABELS[m - 1]} ${y}`;
};

/**
 * Polished reschedule card copy for the app UI.
 * Blank line between Delivery and Previous for spacing inside a box.
 */
const buildRescheduleBox = (deliveryDate, previousDeliveryDate, isRescheduled) => {
  if (!isRescheduled) return null;

  const deliveryLabel = formatDisplayDay(deliveryDate);
  const previousLabel = formatDisplayDay(previousDeliveryDate);
  if (!deliveryLabel && !previousLabel) return null;

  const delivery_line = deliveryLabel ? `Delivery: ${deliveryLabel}` : null;
  const previous_line = previousLabel ? `Previous: ${previousLabel}` : null;
  const lines = [delivery_line, previous_line].filter(Boolean);

  return {
    title: 'Rescheduled',
    delivery_line,
    previous_line,
    // Blank line between for spacing when rendered in a card/box
    text: lines.join('\n\n'),
  };
};

const isAwaitingMarkReady = (order) => {
  if (order.status === 'order_finalized') return true;
  return order.status === 'in_process' && !isClassificationPending(order);
};

const buildTaskOperationalDistribution = (orders) => ({
  pending_classification: orders.filter(isClassificationPending).length,
  awaiting_mark_ready: orders.filter(isAwaitingMarkReady).length,
  ready_for_dispatch: orders.filter((o) => o.status === 'ready_for_delivery').length,
  out_for_delivery: orders.filter((o) => o.status === 'out_for_delivery').length,
});

const getOrderLoadProcessedValue = (order) => {
  if (Number(order.service_id) === 2 && hasConfirmedClothes(order)) {
    return Number(order.actual_clothes_count) || 0;
  }

  if (
    Number(order.service_id) !== 2 &&
    hasConfirmedWeight(order) &&
    hasConfirmedClothes(order)
  ) {
    return Number(order.actual_weight) || 0;
  }

  return 0;
};

const isLoadProcessedOrder = (order) => {
  const status = normalizeStatus(order.status);
  if (
    ['order_finalized', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(
      status,
    )
  ) {
    return getOrderLoadProcessedValue(order) > 0;
  }

  if (status === 'in_process') {
    return getOrderLoadProcessedValue(order) > 0;
  }

  return false;
};

/** Same shape as date-filter performance_overview, computed from order rows */
const buildPerformanceOverviewFromOrders = (orders) => {
  const receivedStatuses = [
    'in_process',
    'order_finalized',
    'ready_for_delivery',
    'out_for_delivery',
    'delivered',
  ];
  const revenueStatuses = ['ready_for_delivery', 'out_for_delivery', 'delivered'];

  const ordersReceived = orders.filter((o) =>
    receivedStatuses.includes(normalizeStatus(o.status)),
  ).length;
  const ordersDelivered = orders.filter(
    (o) => normalizeStatus(o.status) === 'delivered',
  ).length;
  const loadProcessed = orders
    .filter(isLoadProcessedOrder)
    .reduce((sum, o) => sum + getOrderLoadProcessedValue(o), 0);
  const revenue = orders
    .filter(
      (o) =>
        revenueStatuses.includes(normalizeStatus(o.status)) &&
        o.vendor_revenue != null,
    )
    .reduce((sum, o) => sum + (Number(o.vendor_revenue) || 0), 0);

  return {
    orders_received: ordersReceived,
    orders_delivered: ordersDelivered,
    load_processed: {
      value: loadProcessed,
      unit: 'kg/pieces',
    },
    revenue,
  };
};

const buildTaskProgress = (orders) => {
  const total = orders.length;
  const left = orders.filter(isClassificationPending).length;
  const rescheduled_count = orders.filter((o) => Boolean(o.is_rescheduled)).length;
  return {
    total,
    done: total - left,
    left,
    rescheduled_count,
  };
};

const getTaskListStatus = (order) => {
  if (order.status === 'order_finalized') return 'order_finalized';
  return getVendorOperationalStatus(order);
};

const mapTaskOrderToListItem = (order) => {
  const serviceConfig = SERVICE_CONFIG[order.service_id] || {
    image: order.service_image || null,
  };
  const is_rescheduled = Boolean(order.is_rescheduled);
  const delivery_date = formatPgDate(order.delivery_date);
  const previous_delivery_date = formatPgDate(order.previous_delivery_date);

  return {
    id: order.id,
    customer: `CUST${String(order.user_id).padStart(3, '0')}`,
    type: isExpressOrder(order.service_type_name) ? 'Express' : 'Regular',
    details: buildOrderDetails(order),
    image: serviceConfig.image || order.service_image,
    status: getTaskListStatus(order),
    pickup_date: formatPgDate(order.pickup_date),
    delivery_date,
    is_rescheduled,
    previous_delivery_date,
    reschedule_box: buildRescheduleBox(
      delivery_date,
      previous_delivery_date,
      is_rescheduled,
    ),
  };
};

/**
 * Current / overdue task deadline helpers.
 */
const buildEmptyTaskDeadline = () => ({
  date: null,
  day_of_week: null,
  day_label: null,
  shift_id: null,
  shift_name: null,
  pincode_group_id: null,
});

const buildTaskDeadlinePayload = ({
  date = null,
  day_of_week = null,
  shift_id = null,
  shift_name = null,
  pincode_group_id = null,
} = {}) => ({
  date: date || null,
  day_of_week: day_of_week != null ? Number(day_of_week) : null,
  day_label: day_of_week != null ? (DAY_LABELS[Number(day_of_week)] || null) : null,
  shift_id: shift_id != null ? Number(shift_id) : null,
  shift_name: shift_name || null,
  pincode_group_id: pincode_group_id != null ? Number(pincode_group_id) : null,
});

const fetchNextScheduleRow = async (vendor_id) => {
  const { rows } = await sql.query(
    `
    SELECT
      lgss.pincode_group_id,
      lgss.day_of_week,
      lgss.shift_id,
      s.shift_name,
      s.start_time,
      s.end_time,
      CASE
        WHEN lgss.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
             AND s.end_time > (CURRENT_TIMESTAMP::time)
          THEN CURRENT_DATE
        WHEN lgss.day_of_week = EXTRACT(ISODOW FROM CURRENT_DATE)::int
          THEN (CURRENT_DATE + 7)
        ELSE (
          CURRENT_DATE
          + ((lgss.day_of_week - EXTRACT(ISODOW FROM CURRENT_DATE)::int + 7) % 7)
        )
      END::date AS next_date
    FROM laundry_group_shift_schedule lgss
    JOIN shifts s ON s.id = lgss.shift_id
    WHERE lgss.laundry_id = $1
      AND COALESCE(s.status, TRUE) IS TRUE
    ORDER BY next_date ASC, s.start_time ASC, lgss.id ASC
    LIMIT 1
    `,
    [vendor_id],
  );

  return rows[0] || null;
};

const fetchScheduleForDate = async (vendor_id, deadlineDate) => {
  if (!deadlineDate) return null;

  const { rows } = await sql.query(
    `
    SELECT
      lgss.pincode_group_id,
      lgss.day_of_week,
      lgss.shift_id,
      s.shift_name,
      EXTRACT(ISODOW FROM $2::date)::int AS date_day_of_week
    FROM laundry_group_shift_schedule lgss
    JOIN shifts s ON s.id = lgss.shift_id
    WHERE lgss.laundry_id = $1
      AND lgss.day_of_week = EXTRACT(ISODOW FROM $2::date)::int
      AND COALESCE(s.status, TRUE) IS TRUE
    ORDER BY s.start_time ASC, lgss.id ASC
    LIMIT 1
    `,
    [vendor_id, deadlineDate],
  );

  if (rows[0]) return rows[0];

  const dowResult = await sql.query(
    `SELECT EXTRACT(ISODOW FROM $1::date)::int AS day_of_week`,
    [deadlineDate],
  );

  return {
    pincode_group_id: null,
    day_of_week: Number(dowResult.rows[0]?.day_of_week) || null,
    shift_id: null,
    shift_name: null,
    date_day_of_week: Number(dowResult.rows[0]?.day_of_week) || null,
  };
};

const fetchEarliestPendingDeliveryDate = async (
  vendor_id,
  { beforeDate = null, onOrAfterDate = null } = {},
) => {
  const params = [vendor_id, TASK_VENDOR_PENDING_STATUSES];
  let dateClause = '';

  if (beforeDate) {
    params.push(beforeDate);
    dateClause += ` AND delivery_date < $${params.length}::date`;
  }
  if (onOrAfterDate) {
    params.push(onOrAfterDate);
    dateClause += ` AND delivery_date >= $${params.length}::date`;
  }

  const { rows } = await sql.query(
    `
    SELECT MIN(delivery_date)::date AS earliest_delivery_date
    FROM orders
    WHERE vendor_id = $1
      AND delivery_date IS NOT NULL
      AND status = ANY($2::text[])
      ${dateClause}
    `,
    params,
  );

  return formatPgDate(rows[0]?.earliest_delivery_date);
};

/**
 * Current task deadline = next laundry schedule slot, or the earliest
 * pending delivery date from today onward when that is sooner.
 */
const resolveCurrentTaskDeadline = async (vendor_id) => {
  const scheduleRow = await fetchNextScheduleRow(vendor_id);
  const today = formatDate(new Date());
  const earliestUpcomingPending = await fetchEarliestPendingDeliveryDate(vendor_id, {
    onOrAfterDate: today,
  });

  let deadlineDate = null;
  if (earliestUpcomingPending && scheduleRow) {
    const scheduleDate = formatPgDate(scheduleRow.next_date);
    deadlineDate =
      earliestUpcomingPending <= scheduleDate
        ? earliestUpcomingPending
        : scheduleDate;
  } else if (earliestUpcomingPending) {
    deadlineDate = earliestUpcomingPending;
  } else if (scheduleRow) {
    deadlineDate = formatPgDate(scheduleRow.next_date);
  }

  if (!deadlineDate) return null;

  const daySchedule = (await fetchScheduleForDate(vendor_id, deadlineDate)) || scheduleRow;
  return buildTaskDeadlinePayload({
    date: deadlineDate,
    day_of_week: daySchedule?.day_of_week ?? daySchedule?.date_day_of_week,
    shift_id: daySchedule?.shift_id,
    shift_name: daySchedule?.shift_name,
    pincode_group_id: daySchedule?.pincode_group_id,
  });
};

/**
 * Overdue task deadline = earliest past delivery_date still awaiting
 * vendor mark-ready (in_process / order_finalized).
 */
const resolveOverdueTaskDeadline = async (vendor_id) => {
  const today = formatDate(new Date());
  const overdueDate = await fetchEarliestPendingDeliveryDate(vendor_id, {
    beforeDate: today,
  });
  if (!overdueDate) return null;

  const daySchedule = await fetchScheduleForDate(vendor_id, overdueDate);
  return buildTaskDeadlinePayload({
    date: overdueDate,
    day_of_week: daySchedule?.day_of_week ?? daySchedule?.date_day_of_week,
    shift_id: daySchedule?.shift_id,
    shift_name: daySchedule?.shift_name,
    pincode_group_id: daySchedule?.pincode_group_id,
  });
};

const fetchVendorTaskOrders = async (vendor_id, taskDeadline) => {
  if (!taskDeadline?.date) return [];

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.pickup_slot_id,
      o.delivery_slot_id,
      o.status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.service_id,
      o.final_total,
      o.vendor_revenue,
      o.vendor_amount_per_kg,
      o.pickup_completed_at,
      o.delivery_completed_at,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
      TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
      COALESCE(o.is_rescheduled, false) AS is_rescheduled,
      TO_CHAR(o.previous_delivery_date, 'YYYY-MM-DD') AS previous_delivery_date,
      s.name AS service_name,
      s.image AS service_image,
      st.name AS service_type_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.delivery_date = $2::date
      AND o.status = ANY($3::text[])
    ORDER BY o.id DESC
    `,
    [vendor_id, taskDeadline.date, TASK_ACTIVE_STATUSES],
  );

  return rows;
};

const resolveTaskDeadlineFromQuery = async (vendor_id, query = {}, scope = 'current') => {
  const date =
    query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(query.date))
      ? String(query.date)
      : null;

  if (!date) {
    return scope === 'overdue'
      ? resolveOverdueTaskDeadline(vendor_id)
      : resolveCurrentTaskDeadline(vendor_id);
  }

  const daySchedule = await fetchScheduleForDate(vendor_id, date);
  const shiftId =
    query.shift_id != null && String(query.shift_id).trim() !== ''
      ? Number(query.shift_id)
      : daySchedule?.shift_id;
  const pincodeGroupId =
    query.pincode_group_id != null && String(query.pincode_group_id).trim() !== ''
      ? Number(query.pincode_group_id)
      : daySchedule?.pincode_group_id;

  let shiftName = daySchedule?.shift_name || null;
  if (shiftId != null && Number.isInteger(shiftId) && shiftId > 0) {
    const { rows } = await sql.query(
      `SELECT shift_name FROM shifts WHERE id = $1`,
      [shiftId],
    );
    if (rows[0]?.shift_name) shiftName = rows[0].shift_name;
  }

  return buildTaskDeadlinePayload({
    date,
    day_of_week: daySchedule?.day_of_week ?? daySchedule?.date_day_of_week,
    shift_id: Number.isInteger(shiftId) && shiftId > 0 ? shiftId : null,
    shift_name: shiftName,
    pincode_group_id:
      Number.isInteger(pincodeGroupId) && pincodeGroupId > 0 ? pincodeGroupId : null,
  });
};

const buildTaskShiftListPayload = (taskDeadline, orders, pageOrders) => {
  const shiftType = taskDeadline.shift_name
    ? String(taskDeadline.shift_name).trim().toLowerCase()
    : null;
  const rescheduled_count = orders.filter((o) => Boolean(o.is_rescheduled)).length;

  return {
    id: taskDeadline.shift_id,
    shift_title: taskDeadline.shift_name,
    total_orders: orders.length,
    rescheduled_count,
    shift_type: shiftType,
    operational_distribution: buildTaskOperationalDistribution(orders),
    todays_batch_overview: {
      total_orders: orders.length,
      services: buildDashboardBatchServices(orders),
    },
    orders: pageOrders,
  };
};

export const orderTaskDashboardService = async (vendor_id) => {
  const taskDeadline =
    (await resolveCurrentTaskDeadline(vendor_id)) || buildEmptyTaskDeadline();
  const overdueTaskDeadline =
    (await resolveOverdueTaskDeadline(vendor_id)) || buildEmptyTaskDeadline();

  const [currentOrders, overdueOrders] = await Promise.all([
    fetchVendorTaskOrders(vendor_id, taskDeadline),
    fetchVendorTaskOrders(vendor_id, overdueTaskDeadline),
  ]);

  // Combined open task-board work (current + overdue batches)
  const openTaskOrders = [...currentOrders, ...overdueOrders];

  return {
    filter: 'task',
    task_deadline: taskDeadline,
    task_progress: buildTaskProgress(currentOrders),
    overdue_task_deadline: overdueTaskDeadline,
    overdue_task_progress: buildTaskProgress(overdueOrders),
    performance_overview: buildPerformanceOverviewFromOrders(openTaskOrders),
    operational_distribution: buildTaskOperationalDistribution(openTaskOrders),
  };
};

export const getVendorTaskOrdersService = async (vendor_id, query = {}) => {
  const scopeRaw = String(query.scope || 'current').toLowerCase();
  const scope = scopeRaw === 'overdue' ? 'overdue' : 'current';

  const taskDeadline =
    (await resolveTaskDeadlineFromQuery(vendor_id, query, scope))
    || buildEmptyTaskDeadline();
  const orders = await fetchVendorTaskOrders(vendor_id, taskDeadline);
  const mappedOrders = orders.map(mapTaskOrderToListItem);
  const { items: pageOrders, pagination } = paginateArray(mappedOrders, query);
  const shiftPayload = buildTaskShiftListPayload(taskDeadline, orders, pageOrders);
  const task_progress = buildTaskProgress(orders);

  return {
    mode: 'task',
    scope,
    task_deadline: taskDeadline,
    task_progress,
    rescheduled_count: task_progress.rescheduled_count,
    performance_overview: buildPerformanceOverviewFromOrders(orders),
    shifts: taskDeadline.shift_id || orders.length ? [shiftPayload] : [],
    pagination,
  };
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_PERIODS = ['today', 'week', 'month', 'custom'];

const resolveHistoryDateRange = ({ period, date, date_from, date_to } = {}) => {
  const today = formatDate(new Date());
  const normalizedPeriod = HISTORY_PERIODS.includes(String(period || '').toLowerCase())
    ? String(period).toLowerCase()
    : 'today';

  if (normalizedPeriod === 'today') {
    const day = date && DATE_RE.test(date) ? date : today;
    return { period: 'today', date_from: day, date_to: day };
  }

  if (
    date_from &&
    date_to &&
    DATE_RE.test(date_from) &&
    DATE_RE.test(date_to)
  ) {
    if (date_from > date_to) {
      throw { status: 400, message: 'date_from must be on or before date_to' };
    }
    return { period: normalizedPeriod, date_from, date_to };
  }

  if (normalizedPeriod === 'week') {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      period: 'week',
      date_from: formatDate(monday),
      date_to: formatDate(sunday),
    };
  }

  if (normalizedPeriod === 'month') {
    const now = new Date();
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { period: 'month', date_from: start, date_to: end };
  }

  throw {
    status: 400,
    message: 'date_from and date_to (YYYY-MM-DD) are required for custom period',
  };
};

const resolveShiftTypeKey = (shiftName) => {
  if (!shiftName) return null;
  return String(shiftName).trim().toLowerCase().split(/\s+/)[0] || null;
};

const formatHistoryIso = (value) => {
  if (value == null || value === '') return null;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!raw) return null;

  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    return raw.replace(' ', 'T');
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    const normalized = raw.replace(' ', 'T').split('.')[0];
    const withSeconds =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
        ? `${normalized}:00`
        : normalized;
    return `${withSeconds}+05:30`;
  }

  if (DATE_RE.test(raw)) return `${raw}T00:00:00+05:30`;
  return null;
};

const buildHistoryOrderDetails = (order) => {
  const items = Number(order.actual_clothes_count || order.clothes_count || 0);
  const isWash = Number(order.service_id) === 1;
  const weight = Number(order.actual_weight || 0);

  if (isWash && weight > 0) {
    return `Weight/Pieces: ${parseFloat(weight.toFixed(1))} kg / ${items} Items`;
  }

  return `Weight/Pieces: ${items} Items`;
};

const getHistoryOrderDate = (order) =>
  formatPgDate(
    order.history_date ||
      order.delivery_completed_at ||
      order.delivery_date ||
      order.ready_for_delivery_at ||
      order.vendor_received_at,
  );

const mapHistoryOrderToListItem = (order) => {
  const serviceConfig = SERVICE_CONFIG[order.service_id] || {};
  const shiftType = resolveShiftTypeKey(order.pickup_shift_name);
  const shiftLabel = shiftType
    ? shiftType.charAt(0).toUpperCase() + shiftType.slice(1)
    : null;
  const status = getVendorOperationalStatus(order);
  const weightKg = Number(order.actual_weight || 0);
  const clothes = Number(order.actual_clothes_count || order.clothes_count || 0);
  const amount =
    order.vendor_revenue != null
      ? Number(order.vendor_revenue)
      : order.final_total != null
        ? Number(order.final_total)
        : 0;

  const is_rescheduled = Boolean(order.is_rescheduled);
  const delivery_date = formatPgDate(order.delivery_date);
  const previous_delivery_date = formatPgDate(order.previous_delivery_date);

  return {
    id: order.id,
    customer: `CUST-${String(order.user_id).padStart(4, '0')}`,
    type: isExpressOrder(order.service_type_name) ? 'Express' : 'Regular',
    service: serviceConfig.type || order.service_name || null,
    details: buildHistoryOrderDetails(order),
    image: serviceConfig.image || order.service_image || null,
    status,
    shift: shiftType,
    shift_label: shiftLabel,
    date: getHistoryOrderDate(order),
    delivery_date,
    is_rescheduled,
    previous_delivery_date,
    reschedule_box: buildRescheduleBox(
      delivery_date,
      previous_delivery_date,
      is_rescheduled,
    ),
    completed_at:
      status === 'delivered' ? formatHistoryIso(order.delivery_completed_at) : null,
    weight_kg: weightKg > 0 ? parseFloat(weightKg.toFixed(1)) : 0,
    clothes,
    amount: parseFloat(Number(amount).toFixed(2)),
  };
};

const buildHistorySummary = (orders) => {
  let delivered = 0;
  let readyForDispatch = 0;
  let totalClothes = 0;
  let totalKg = 0;

  for (const order of orders) {
    const status = getVendorOperationalStatus(order);
    if (status === 'delivered') delivered += 1;
    if (status === 'ready_for_dispatch') readyForDispatch += 1;
    totalClothes += Number(order.actual_clothes_count || order.clothes_count || 0);
    totalKg += Number(order.actual_weight || 0);
  }

  return {
    total_orders: orders.length,
    delivered,
    ready_for_dispatch: readyForDispatch,
    total_clothes: totalClothes,
    total_kg: parseFloat(totalKg.toFixed(1)),
    rescheduled_count: orders.filter((o) => Boolean(o.is_rescheduled)).length,
  };
};

const buildHistoryShifts = (orders) => {
  const groups = new Map();

  for (const order of orders) {
    const item = mapHistoryOrderToListItem(order);
    const shiftType = item.shift || 'other';
    if (!groups.has(shiftType)) {
      groups.set(shiftType, {
        id: shiftType === 'morning' ? 1 : shiftType === 'evening' ? 2 : groups.size + 1,
        shift_title: item.shift_label || 'Other',
        shift_type: shiftType,
        total_orders: 0,
        rescheduled_count: 0,
        orders: [],
      });
    }
    const group = groups.get(shiftType);
    group.orders.push(item);
    group.total_orders += 1;
    if (item.is_rescheduled) group.rescheduled_count += 1;
  }

  const orderRank = { morning: 0, evening: 1 };
  return [...groups.values()].sort(
    (a, b) => (orderRank[a.shift_type] ?? 99) - (orderRank[b.shift_type] ?? 99),
  );
};

const applyHistoryFilters = (orders, query = {}) => {
  let filtered = orders;

  const status = query.status != null && String(query.status).trim() !== ''
    ? String(query.status).trim().toLowerCase()
    : null;
  if (status) {
    filtered = filtered.filter((order) => {
      const operational = getVendorOperationalStatus(order);
      const raw = String(order.status || '').toLowerCase();
      return operational === status || raw === status;
    });
  }

  const type = query.type != null && String(query.type).trim() !== ''
    ? String(query.type).trim().toLowerCase()
    : null;
  if (type) {
    filtered = filtered.filter((order) => {
      const orderType = isExpressOrder(order.service_type_name)
        ? 'express'
        : 'regular';
      return orderType === type;
    });
  }

  const shift = query.shift != null && String(query.shift).trim() !== ''
    ? resolveShiftTypeKey(query.shift)
    : null;
  if (shift) {
    filtered = filtered.filter(
      (order) => resolveShiftTypeKey(order.pickup_shift_name) === shift,
    );
  }

  const search = query.search != null && String(query.search).trim() !== ''
    ? String(query.search).trim().toLowerCase()
    : null;
  if (search) {
    filtered = filtered.filter((order) => {
      const code = String(order.order_code || '').toLowerCase();
      const id = String(order.id);
      const display = formatDisplayOrderId(order).toLowerCase();
      return (
        code.includes(search) ||
        id.includes(search) ||
        display.includes(search)
      );
    });
  }

  return filtered;
};

export const getVendorHistoryOrdersService = async (vendor_id, query = {}) => {
  const { period, date_from, date_to } = resolveHistoryDateRange(query);

  const { rows: orders } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.pickup_slot_id,
      o.status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.service_id,
      o.final_total,
      o.vendor_revenue,
      TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
      o.delivery_completed_at,
      o.ready_for_delivery_at,
      o.vendor_received_at,
      o.vendor_received_at::date AS history_date,
      COALESCE(o.is_rescheduled, false) AS is_rescheduled,
      TO_CHAR(o.previous_delivery_date, 'YYYY-MM-DD') AS previous_delivery_date,
      s.name AS service_name,
      s.image AS service_image,
      st.name AS service_type_name,
      pts.shift_name AS pickup_shift_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN time_slots pts ON pts.id = o.pickup_slot_id
    WHERE o.vendor_id = $1
      AND o.vendor_received_at IS NOT NULL
      AND o.vendor_received_at::date BETWEEN $2::date AND $3::date
      AND o.status NOT IN ('draft', 'cancelled')
    ORDER BY
      o.vendor_received_at DESC,
      o.id DESC
    `,
    [vendor_id, date_from, date_to],
  );

  const filtered = applyHistoryFilters(orders, query);
  const summary = buildHistorySummary(filtered);
  const { items: pageOrders, pagination } = paginateArray(filtered, query);
  const shifts = buildHistoryShifts(pageOrders);

  return {
    mode: 'history',
    period,
    date_from,
    date_to,
    summary,
    rescheduled_count: summary.rescheduled_count,
    pagination,
    shifts,
  };
};

const getBatchOverviewKey = (filter) => {
  if (filter === 'this_week') return 'weeks_batch_overview';
  if (filter === 'this_month') return 'months_batch_overview';
  return 'todays_batch_overview';
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

const buildOrderDetails = (order) => {
  const items = Number(
    order.actual_clothes_count || order.clothes_count || 0,
  );
  const isWash = Number(order.service_id) === 1;

  if (isWash) {
    const estKg = getEstimatedKg(
      order.estimated_weight_min,
      order.estimated_weight_max,
    );
    const weightPart =
      estKg > 0 ? `Est. ${estKg} kg/` : order.actual_weight
        ? `${parseFloat(Number(order.actual_weight).toFixed(1))} kg/`
        : '';
    return `Weight/Pieces: ${weightPart}${items} Items`.replace(/\/$/, '');
  }

  return `Weight/Pieces: ${items} Items`;
};

const mapOrderToListItem = (order) => {
  const serviceConfig = SERVICE_CONFIG[order.service_id] || {
    image: order.service_image || null,
  };

  const typeLabel = isExpressOrder(order.service_type_name)
    ? 'Express'
    : 'Regular';

  return {
    id: order.id,
    customer: `CUST${String(order.user_id).padStart(3, '0')}`,
    type: typeLabel,
    details: buildOrderDetails(order),
    image: serviceConfig.image || order.service_image,
    status: getVendorOperationalStatus(order),
    pickup_completed_at: formatDateTime(order.pickup_completed_at),
    delivery_completed_at: formatDateTime(order.delivery_completed_at),
  };
};

const buildServiceBatchOverview = (orders) => {
  const washOrders = orders.filter((o) => Number(o.service_id) === 1);
  const dryOrders = orders.filter((o) => Number(o.service_id) === 2);

  const services = [];

  if (washOrders.length) {
    services.push({
      id: SERVICE_CONFIG[1].id,
      type: SERVICE_CONFIG[1].type,
      estimated_kg: parseFloat(
        washOrders
          .reduce(
            (sum, o) =>
              sum +
              getEstimatedKg(o.estimated_weight_min, o.estimated_weight_max),
            0,
          )
          .toFixed(1),
      ),
      final_kg: parseFloat(
        washOrders
          .reduce((sum, o) => sum + Number(o.actual_weight || 0), 0)
          .toFixed(1),
      ),
      regular_orders: washOrders.filter((o) => !isExpressOrder(o.service_type_name))
        .length,
      express_orders: washOrders.filter((o) => isExpressOrder(o.service_type_name))
        .length,
    });
  }

  if (dryOrders.length) {
    services.push({
      id: SERVICE_CONFIG[2].id,
      type: SERVICE_CONFIG[2].type,
      total_items: dryOrders.reduce(
        (sum, o) => sum + Number(o.clothes_count || 0),
        0,
      ),
      regular_orders: dryOrders.filter((o) => !isExpressOrder(o.service_type_name))
        .length,
      express_orders: dryOrders.filter((o) => isExpressOrder(o.service_type_name))
        .length,
    });
  }

  return services;
};

const buildDashboardBatchServices = (orders) => {
  const filled = buildServiceBatchOverview(orders);
  const byId = Object.fromEntries(filled.map((s) => [s.id, s]));

  return [
    byId.wash_by_kilo || {
      id: SERVICE_CONFIG[1].id,
      type: SERVICE_CONFIG[1].type,
      estimated_kg: 0,
      final_kg: 0,
      regular_orders: 0,
      express_orders: 0,
    },
    byId.dry_clean || {
      id: SERVICE_CONFIG[2].id,
      type: SERVICE_CONFIG[2].type,
      total_items: 0,
      regular_orders: 0,
      express_orders: 0,
    },
  ];
};

const buildOperationalDistribution = (orders) => ({
  pending_classification: orders.filter(isClassificationPending).length,
  in_processing: orders.filter(
    (o) =>
      o.status === 'order_finalized' ||
      (o.status === 'in_process' && !isClassificationPending(o)),
  ).length,
  ready_for_dispatch: orders.filter((o) => o.status === 'ready_for_delivery').length,
  out_for_delivery: orders.filter((o) => o.status === 'out_for_delivery').length,
});

const buildShiftPayload = (slotId, orders, lotCode, shiftByPickupSlot) => {
  const config = shiftByPickupSlot[slotId];
  const shiftOrders = orders.filter(
    (o) => Number(o.pickup_slot_id) === Number(slotId),
  );

  return {
    id: config.id,
    shift_title: `${config.title_prefix} ${lotCode}`,
    total_orders: shiftOrders.length,
    shift_type: config.shift_type,
    operational_distribution: buildOperationalDistribution(shiftOrders),
    todays_batch_overview: {
      total_orders: shiftOrders.length,
      services: buildDashboardBatchServices(shiftOrders),
    },
    orders: shiftOrders.map(mapOrderToListItem),
  };
};

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
  if (filter === 'task') {
    return orderTaskDashboardService(vendor_id);
  }

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
          'order_finalized',
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
      ) AS orders_received,

      COUNT(*) FILTER (
        WHERE status = 'delivered'
      ) AS orders_delivered,

      COALESCE(SUM(
        CASE
          WHEN service_id = 2 AND actual_clothes_count > 0 THEN actual_clothes_count
          WHEN COALESCE(service_id, 1) <> 2
            AND actual_weight IS NOT NULL
            AND actual_clothes_count > 0
            THEN actual_weight
          ELSE 0
        END
      ) FILTER (
        WHERE status IN (
          'order_finalized',
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
        OR (
          status = 'in_process'
          AND (
            (service_id = 2 AND actual_clothes_count > 0)
            OR (
              COALESCE(service_id, 1) <> 2
              AND actual_weight IS NOT NULL
              AND actual_clothes_count > 0
            )
          )
        )
      ), 0) AS load_processed,

      COALESCE(SUM(vendor_revenue) FILTER (
        WHERE status IN (
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
          AND vendor_revenue IS NOT NULL
      ), 0) AS revenue

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at::date BETWEEN $2::date AND $3::date
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
      o.service_id,
      o.status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      st.name AS service_type_name
    FROM orders o
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.vendor_received_at::date BETWEEN $2::date AND $3::date
      AND o.status NOT IN ('draft', 'cancelled')
    `,
    [vendor_id, start, end]
  );

  const batchOrders = batchResult.rows;
  const batchLabel = getBatchOverviewKey(filter);

  // =========================
  // 3. OPERATIONAL DISTRIBUTION
  // =========================
  const opsResult = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'in_process'
          AND (
            (
              service_id = 2
              AND (actual_clothes_count IS NULL OR actual_clothes_count = 0)
            )
            OR (
              COALESCE(service_id, 1) <> 2
              AND (
                actual_weight IS NULL
                OR actual_clothes_count IS NULL
                OR actual_clothes_count = 0
              )
            )
          )
      ) AS pending_classification,

      COUNT(*) FILTER (
        WHERE status = 'order_finalized'
          OR (
            status = 'in_process'
            AND (
              (
                service_id = 2
                AND actual_clothes_count IS NOT NULL
                AND actual_clothes_count > 0
              )
              OR (
                COALESCE(service_id, 1) <> 2
                AND actual_weight IS NOT NULL
                AND actual_clothes_count IS NOT NULL
                AND actual_clothes_count > 0
              )
            )
          )
      ) AS in_processing,

      COUNT(*) FILTER (
        WHERE status = 'ready_for_delivery'
      ) AS ready_for_dispatch,

      COUNT(*) FILTER (
        WHERE status = 'out_for_delivery'
      ) AS out_for_delivery

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at::date BETWEEN $2::date AND $3::date
      AND status NOT IN ('draft', 'cancelled')
    `,
    [vendor_id, start, end]
  );

  const ops = opsResult.rows[0];

  return {
    filter,
    generated_at: formatGeneratedAt(),
    date_range: { start, end },

    performance_overview: {
      orders_received: parseInt(perf.orders_received, 10),
      orders_delivered: parseInt(perf.orders_delivered, 10),
      load_processed: {
        value: parseFloat(perf.load_processed),
        unit: 'kg/pieces',
      },
      revenue: parseFloat(perf.revenue),
    },

    [batchLabel]: {
      total_orders: batchOrders.length,
      services: buildDashboardBatchServices(batchOrders),
    },

    operational_distribution: {
      pending_classification: parseInt(ops.pending_classification, 10),
      in_processing: parseInt(ops.in_processing, 10),
      ready_for_dispatch: parseInt(ops.ready_for_dispatch, 10),
      out_for_delivery: parseInt(ops.out_for_delivery, 10),
    },
  };
};

export const getVendorOrdersService = async (vendor_id, selectedDate, query = {}) => {
  const { pickupShiftSlotIds, shiftByPickupSlot } =
    await getPickupShiftConfig();
  const date =
    selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? selectedDate
      : formatDate(new Date());

  const { rows: orders } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.pickup_slot_id,
      o.status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.service_id,
      o.pickup_completed_at,
      o.delivery_completed_at,
      s.name AS service_name,
      s.image AS service_image,
      st.name AS service_type_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.pickup_date = $2::date
      AND o.pickup_slot_id = ANY($3::int[])
      AND o.status NOT IN ('draft', 'cancelled')
    ORDER BY o.id DESC
    `,
    [vendor_id, date, pickupShiftSlotIds],
  );

  const lotCode = `LOT-${String(vendor_id).padStart(3, '0')}`;
  const { items: pageOrders, pagination } = paginateArray(orders, query);

  return {
    selected_date: date,
    shifts: pickupShiftSlotIds.map((slotId) =>
      buildShiftPayload(slotId, pageOrders, lotCode, shiftByPickupSlot),
    ),
    pagination,
  };
};

export const getOrderDetailsService = async (vendor_id, order_id) => {
  const result = await sql.query(
    `
    SELECT 
      o.id,
      o.user_id,
      o.order_code,
      o.service_id,
      u.full_name AS customer_name,
      u.profile_image AS customer_image,
      ua.complete_address AS address,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.clothes_count,
      o.actual_clothes_count,
      o.actual_weight,
      o.is_stained,
      o.stain_images,
      o.is_damaged,
      o.damage_count,
      o.damage_images,
      o.vendor_request_amount,
      o.vendor_request_markup,
      o.vendor_revenue,
      o.vendor_amount_per_kg,
      s.name AS service_name,
      s.image AS service_image,
      st.name AS service_type_name,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
      pickup_slot.start_time AS pickup_slot_start,
      pickup_slot.end_time AS pickup_slot_end,
      TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
      delivery_slot.start_time AS delivery_slot_start,
      delivery_slot.end_time AS delivery_slot_end,
      o.status,
      o.estimated_total,
      o.final_total,
      o.booked_at,
      o.out_for_pickup_at,
      o.pickup_started_at,
      o.pickup_completed_at,
      o.vendor_received_at,
      o.order_finalized_at,
      o.ready_for_delivery_at,
      o.out_for_delivery_at,
      o.delivery_completed_at,
      o.cancelled_at,
      o.payment_completed_at,
      o.created_at,
      o.updated_at,
      o.otp_generated_at
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN user_address_details ua ON o.address_id = ua.id
    LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id = pickup_slot.id
    LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id = delivery_slot.id
    WHERE o.id = $1 AND o.vendor_id = $2
    `,
    [order_id, vendor_id]
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  const order = result.rows[0];

  const internalId = parseInt(order.id, 10);

  return {
    id: order.id,
    display_order_id: formatDisplayOrderId(order),
    classification_status: getClassificationStatus(order),
    order_id: internalId,
    customer: {
      id: `CUST${String(order.user_id).padStart(3, '0')}`,
      name: order.customer_name,
      image: order.customer_image || '/assets/images/avatar.png',
    },
    address: order.address,
    estimated_weight: {
      min: parseFloat(order.estimated_weight_min || 0),
      max: parseFloat(order.estimated_weight_max || 0),
      unit: 'kg',
    },
    clothes_count: parseInt(order.clothes_count || 0, 10),
    actual_clothes_count: order.actual_clothes_count
      ? parseInt(order.actual_clothes_count, 10)
      : null,
    actual_weight: order.actual_weight ? parseFloat(order.actual_weight) : null,
    is_stained: order.is_stained ? parseInt(order.is_stained, 10) : 0,
    stain_images: normalizeStainImages(order.stain_images),
    stain_sizes: normalizeStainSizes(order.stain_images),
    is_damaged: order.is_damaged ? parseInt(order.is_damaged, 10) : 0,
    damage_count: order.damage_count != null ? parseInt(order.damage_count, 10) : null,
    damage_images: normalizeDamageImages(order.damage_images),
    vendor_request_amount: order.vendor_request_amount
      ? parseFloat(order.vendor_request_amount)
      : null,
    vendor_request_markup: order.vendor_request_markup
      ? parseFloat(order.vendor_request_markup)
      : null,
    vendor_amount_per_kg: order.vendor_amount_per_kg
      ? parseFloat(order.vendor_amount_per_kg)
      : null,
    vendor_revenue: order.vendor_revenue
      ? parseFloat(order.vendor_revenue)
      : null,
    service: {
      name: order.service_name,
      type: order.service_type_name,
      image: getServiceDisplayImage(order.service_id, order.service_image),
    },
    pickup: {
      date: order.pickup_date,
      slot: {
        start: order.pickup_slot_start,
        end: order.pickup_slot_end,
      },
      pickup_completed_at: formatDateTime(order.pickup_completed_at),
    },
    delivery: {
      date: order.delivery_date,
      slot: {
        start: order.delivery_slot_start,
        end: order.delivery_slot_end,
      },
      delivery_completed_at: formatDateTime(order.delivery_completed_at),
    },
    timestamps: buildOrderTimestamps(order),
    status: getVendorOperationalStatus(order),
    workflow_status: order.status,
    estimated_total: parseFloat(order.estimated_total || 0),
    pricing: {
      base_total: order.final_total
        ? parseFloat(
            (
              Number(order.final_total) -
              Number(
                order.is_stained
                  ? (Number(order.vendor_request_amount) || 0) +
                      (Number(order.vendor_request_markup) || 0)
                  : 0,
              )
            ).toFixed(2),
          )
        : null,
      vendor_request_amount: order.vendor_request_amount
        ? parseFloat(order.vendor_request_amount)
        : null,
      vendor_request_markup: order.vendor_request_markup
        ? parseFloat(order.vendor_request_markup)
        : null,
      vendor_amount_per_kg: order.vendor_amount_per_kg
        ? parseFloat(order.vendor_amount_per_kg)
        : null,
      vendor_revenue: order.vendor_revenue
        ? parseFloat(order.vendor_revenue)
        : null,
      final_total: order.final_total ? parseFloat(order.final_total) : null,
    },
  };
};

export const confirmClothesService = async (vendor_id, order_id, actual_clothes) => {
  const orderCheck = await sql.query(
    `SELECT id, status FROM orders WHERE id = $1 AND vendor_id = $2`,
    [order_id, vendor_id]
  );

  if (orderCheck.rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  if (orderCheck.rows[0].status !== 'in_process') {
    throw { status: 400, message: 'Clothes can only be confirmed when order status is in_process' };
  }

  const actual_clothes_count = parseInt(actual_clothes, 10);

  await sql.query(
    `UPDATE orders SET actual_clothes_count = $1, updated_at = NOW() WHERE id = $2`,
    [actual_clothes_count, order_id]
  );

  return {
    order_id: parseInt(order_id),
    actual_clothes_count,
  };
};

export const confirmWeightService = async (vendor_id, order_id, payload) => {
  const {
    actual_weight,
    is_stained,
    stain_images,
    stain_sizes,
    vendor_request_amount,
    is_damaged,
    damage_count,
    damage_images,
  } = payload;

  const orderCheck = await sql.query(
    `SELECT o.id, o.status, o.base_price_per_kg, o.extra_price_per_kg, o.flat_fee,
            o.peak_extra_charge, o.applied_coupon_id,
            o.estimated_weight_min, o.estimated_weight_max, o.estimated_total,
            o.amount_paid, c.discount_type, c.discount_value, c.minimum_amount_value,
            c.maximum_amount_value, o.vendor_amount_per_kg,
            COALESCE(v.vendor_per_kg_amount, 90) AS vendor_per_kg_amount
     FROM orders o
     LEFT JOIN coupons c ON o.applied_coupon_id = c.id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.id = $1 AND o.vendor_id = $2`,
    [order_id, vendor_id]
  );

  if (orderCheck.rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  if (orderCheck.rows[0].status !== 'in_process') {
    throw { status: 400, message: 'Weight can only be confirmed when order status is in_process' };
  }

  const stained = parseInt(is_stained, 10);
  if (stained !== 0 && stained !== 1) {
    throw { status: 400, message: 'is_stained must be 0 or 1' };
  }

  const damaged = parseInt(is_damaged, 10);
  if (damaged !== 0 && damaged !== 1) {
    throw { status: 400, message: 'is_damaged must be 0 or 1' };
  }

  const imagePaths = Array.isArray(stain_images)
    ? stain_images.filter((path) => typeof path === 'string' && path.trim())
    : [];

  const damageImagePaths = Array.isArray(damage_images)
    ? damage_images.filter((path) => typeof path === 'string' && path.trim())
    : [];

  let sizeList = [];
  if (Array.isArray(stain_sizes)) {
    sizeList = stain_sizes;
  } else if (typeof stain_sizes === 'string' && stain_sizes.trim()) {
    try {
      const parsed = JSON.parse(stain_sizes);
      sizeList = Array.isArray(parsed) ? parsed : [];
    } catch {
      sizeList = [];
    }
  }

  if (stained === 1) {
    if (imagePaths.length === 0) {
      throw { status: 400, message: 'At least one image is required when is_stained is 1' };
    }
    const amount = parseFloat(vendor_request_amount);
    if (!vendor_request_amount || Number.isNaN(amount) || amount <= 0) {
      throw { status: 400, message: 'vendor_request_amount must be a positive number when is_stained is 1' };
    }
  }

  let resolvedDamageCount = null;
  let resolvedDamageImages = null;
  if (damaged === 1) {
    const count = parseInt(damage_count, 10);
    if (!Number.isInteger(count) || count <= 0) {
      throw { status: 400, message: 'damage_count must be a positive integer when is_damaged is 1' };
    }
    if (damageImagePaths.length === 0) {
      throw { status: 400, message: 'At least one damage_image is required when is_damaged is 1' };
    }
    resolvedDamageCount = count;
    resolvedDamageImages = damageImagePaths;
  }

  const order = orderCheck.rows[0];
  const weight = parseFloat(actual_weight);
  const weight_min = Number(order.estimated_weight_min);
  const weight_max = Number(order.estimated_weight_max);
  const within_range = weight <= weight_max;

  let extra_weight_charge = 0;
  let pricing_note;

  if (within_range) {
    pricing_note = 'within_estimate';
  } else {
    const extra_kg = weight - weight_max;
    const rate_per_kg = Number(order.base_price_per_kg) + Number(order.extra_price_per_kg);
    extra_weight_charge = parseFloat((extra_kg * rate_per_kg).toFixed(2));
    pricing_note = 'exceeded_estimate';
  }

  const resolvedImages =
    stained === 1
      ? imagePaths.map((path, index) => {
          const rawSize = sizeList[index];
          const strain_size =
            rawSize === 'small' || rawSize === 'big' ? rawSize : null;
          return strain_size ? { path, strain_size } : { path };
        })
      : null;
  const resolvedAmount = stained === 1 ? parseFloat(vendor_request_amount) : null;
  const ratePerKg = resolveVendorAmountPerKg(order, order.vendor_per_kg_amount);
  // Vendor payout = per-kg earnings + their stain request (markup is platform side)
  const vendor_revenue = parseFloat(
    (weight * ratePerKg + (resolvedAmount || 0)).toFixed(2),
  );
  const vendor_request_markup =
    stained === 1 ? parseFloat((resolvedAmount * 0.3).toFixed(2)) : null;

  const {
    gross_base_total,
    discount,
    base_total,
    subtotal_before_gst: subtotalBeforeGst,
    final_total,
    remaining_amount,
  } = computeFinalTotalsForConfirmWeight({
    order,
    actualWeight: weight,
    extraWeightCharge: extra_weight_charge,
    vendorRequestAmount: resolvedAmount || 0,
    vendorRequestMarkup: vendor_request_markup || 0,
  });

  await sql.query(
    `UPDATE orders
     SET actual_weight = $1,
         final_total = $2,
         is_stained = $3,
         stain_images = $4,
         vendor_request_amount = $5,
         remaining_amount = $6,
         extra_price_per_kg = $7,
         vendor_revenue = $8,
         vendor_request_markup = $9,
         vendor_amount_per_kg = $10,
         is_damaged = $11,
         damage_count = $12,
         damage_images = $13,
         discount_price = $14,
         status = 'in_process',
         updated_at = NOW()
     WHERE id = $15`,
    [
      weight,
      final_total,
      stained,
      resolvedImages ? JSON.stringify(resolvedImages) : null,
      resolvedAmount,
      remaining_amount,
      extra_weight_charge,
      vendor_revenue,
      vendor_request_markup,
      ratePerKg,
      damaged,
      resolvedDamageCount,
      resolvedDamageImages ? JSON.stringify(resolvedDamageImages) : null,
      discount,
      order_id,
    ]
  );

  return {
    order_id: parseInt(order_id),
    actual_weight: weight,
    estimated_range: { min: weight_min, max: weight_max },
    pricing_note,
    gross_base_total,
    extra_weight_charge,
    coupon_discount: discount,
    base_total,
    vendor_amount_per_kg: ratePerKg,
    vendor_request_amount: resolvedAmount,
    vendor_request_markup,
    vendor_revenue,
    subtotal_before_gst: subtotalBeforeGst,
    gst,
    gst_rate: 18,
    final_total,
    is_stained: stained,
    stain_images: resolvedImages
      ? resolvedImages.map((entry) => entry.path)
      : null,
    stain_sizes: resolvedImages
      ? resolvedImages.map((entry) => entry.strain_size ?? null)
      : null,
    is_damaged: damaged,
    damage_count: resolvedDamageCount,
    damage_images: resolvedDamageImages,
  };
};

export const finalizeOrderService = async (vendor_id, order_id) => {
  const orderCheck = await sql.query(
    `SELECT o.id, o.status, o.user_id, o.final_total, o.actual_weight, o.actual_clothes_count
     FROM orders o
     WHERE o.id = $1 AND o.vendor_id = $2`,
    [order_id, vendor_id]
  );

  if (orderCheck.rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  const order = orderCheck.rows[0];

  if (order.status !== 'in_process') {
    throw { status: 400, message: 'Order can only be finalized when status is in_process' };
  }

  if (!order.actual_weight) {
    throw { status: 400, message: 'Please confirm the actual weight before finalizing' };
  }

  if (!order.actual_clothes_count) {
    throw { status: 400, message: 'Please confirm the clothes count before finalizing' };
  }

  // Update status to order_finalized — locks weight/clothes from further edits
  await sql.query(
    `UPDATE orders SET status = 'order_finalized', order_finalized_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Notify user about final amount
  await createNotificationsBatch([{
    identity_id: order.user_id,
    role: 'user',
    title: 'Your laundry has been weighed',
    message: 'The exact weight has been calculated. The final amount details are available in the app.',
    reference_type: 'order',
    reference_id: order_id,
  }]);

  try {
    const { emitWhatsappOrderEventSafe } = await import(
      '../whatsapp/whatsappEvents.service.js'
    );
    emitWhatsappOrderEventSafe('order.weight_confirmed', order_id);
    emitWhatsappOrderEventSafe('order.finalized', order_id);
  } catch (_) {
    /* ignore */
  }

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'order_finalized',
    final_total: parseFloat(order.final_total),
    timestamps,
    order_finalized_at: timestamps.order_finalized_at,
  };
};

export const markReadyForDeliveryService = async (vendor_id, order_id) => {
  console.log(`Marking order ${order_id} as ready for delivery for vendor ${vendor_id}`);
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.user_id, o.order_code FROM orders o
     WHERE o.id = $1 AND o.vendor_id = $2`,
    [order_id, vendor_id]
  );

  if (rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  const order = rows[0];

  if (order.status !== 'order_finalized') {
    throw { status: 400, message: 'Order can only be marked ready when status is order_finalized' };
  }

  // Generate delivery OTP
  const delivery_otp = generateOTP();

  await sql.query(
    `UPDATE orders
     SET status = 'ready_for_delivery', delivery_otp = $1, ready_for_delivery_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [delivery_otp, order_id],
  );

  // Send delivery OTP to user
  await createNotificationsBatch([{
    identity_id: order.user_id,
    role: 'user',
    title: 'Your laundry is ready',
    message: `Your order is packed and ready for delivery. Your delivery OTP is ${delivery_otp}. Please share it with the rider upon delivery.`,
    reference_type: 'order',
    reference_id: order_id,
  }]);

  sendUserEmailSafe(order.user_id, sendDeliveryOtpEmail, {
    orderId: order.id,
    orderCode: order.order_code,
    otp: delivery_otp,
  });

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'ready_for_delivery',
    delivery_otp, // remove in Production
    timestamps,
    ready_for_delivery_at: timestamps.ready_for_delivery_at,
  };
};
