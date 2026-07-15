import sql, { APP_TIMEZONE } from '../../config/db.js';
import { buildOrderTimestamps, fetchOrderTimestamps, formatDateTime } from '../../utils/datetime.util.js';
import { createNotificationsBatch } from '../../utils/notificationHelper.js';
import { sendDeliveryOtpEmail, sendUserEmailSafe } from '../common/email.service.js';
import { generateOTP } from '../../utils/otp.js';
import { applyCouponDiscount, applyGst } from '../../utils/price.util.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import { DAY_LABELS } from '../common/laundryGroupShiftSchedule.service.js';

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

const normalizeStainImages = (value) => {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const images = value.filter((path) => typeof path === 'string' && path.trim());
    return images.length ? images : null;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const images = parsed.filter((path) => typeof path === 'string' && path.trim());
        return images.length ? images : null;
      }
    } catch {
      return [value];
    }
    return [value];
  }
  return null;
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

/** ISO-8601 wall-clock in APP_TIMEZONE, e.g. 2026-07-10T10:00:00+05:30 */
const formatGeneratedAtIso = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`;
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

const buildTaskProgress = (orders) => {
  const total = orders.length;
  const left = orders.filter(isClassificationPending).length;
  return {
    total,
    done: total - left,
    left,
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

  return {
    id: order.id,
    customer: `CUST${String(order.user_id).padStart(3, '0')}`,
    type: isExpressOrder(order.service_type_name) ? 'Express' : 'Regular',
    details: buildOrderDetails(order),
    image: serviceConfig.image || order.service_image,
    status: getTaskListStatus(order),
  };
};

const buildTaskPerformanceOverview = (orders) => {
  const ordersReceived = orders.filter((o) =>
    [
      'in_process',
      'order_finalized',
      'ready_for_delivery',
      'out_for_delivery',
      'delivered',
    ].includes(o.status),
  ).length;

  const ordersDelivered = orders.filter((o) => o.status === 'delivered').length;

  const loadProcessed = orders.reduce((sum, o) => {
    const classified =
      Number(o.service_id) === 2
        ? hasConfirmedClothes(o)
        : hasConfirmedWeight(o) && hasConfirmedClothes(o);

    if (
      !classified &&
      !['order_finalized', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes(
        o.status,
      )
    ) {
      return sum;
    }

    if (Number(o.service_id) === 2) {
      return sum + Number(o.actual_clothes_count || 0);
    }
    return sum + Number(o.actual_weight || 0);
  }, 0);

  const revenue = orders.reduce((sum, o) => {
    if (!['ready_for_delivery', 'out_for_delivery', 'delivered'].includes(o.status)) {
      return sum;
    }
    return sum + Number(o.vendor_revenue || 0);
  }, 0);

  return {
    orders_received: ordersReceived,
    orders_delivered: ordersDelivered,
    load_processed: {
      value: parseFloat(Number(loadProcessed).toFixed(2)),
      unit: 'kg/pieces',
    },
    revenue: parseFloat(Number(revenue).toFixed(2)),
  };
};

/**
 * Next upcoming laundry schedule slot for this vendor (laundry_id).
 * Prefers the earliest delivery_date among orders still awaiting mark-ready
 * (in_process / order_finalized) when that date is on or before the next
 * scheduled occurrence. Orders already ready_for_delivery do not pin a past day.
 */
const resolveVendorTaskDeadline = async (vendor_id) => {
  const scheduleResult = await sql.query(
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

  const orderDeadlineResult = await sql.query(
    `
    SELECT MIN(delivery_date)::date AS earliest_delivery_date
    FROM orders
    WHERE vendor_id = $1
      AND delivery_date IS NOT NULL
      AND status = ANY($2::text[])
    `,
    [vendor_id, TASK_VENDOR_PENDING_STATUSES],
  );

  const scheduleRow = scheduleResult.rows[0] || null;
  const earliestDelivery = formatPgDate(
    orderDeadlineResult.rows[0]?.earliest_delivery_date,
  );

  let deadlineDate = null;
  let dayOfWeek = null;
  let shiftId = null;
  let shiftName = null;
  let pincodeGroupId = null;

  if (earliestDelivery && scheduleRow) {
    const scheduleDate = formatPgDate(scheduleRow.next_date);
    if (earliestDelivery <= scheduleDate) {
      deadlineDate = earliestDelivery;
    } else {
      deadlineDate = scheduleDate;
    }
  } else if (earliestDelivery) {
    deadlineDate = earliestDelivery;
  } else if (scheduleRow) {
    deadlineDate = formatPgDate(scheduleRow.next_date);
  }

  if (!deadlineDate) return null;

  const deadlineDowResult = await sql.query(
    `SELECT EXTRACT(ISODOW FROM $1::date)::int AS day_of_week`,
    [deadlineDate],
  );
  dayOfWeek = Number(deadlineDowResult.rows[0].day_of_week);

  const dayScheduleResult = await sql.query(
    `
    SELECT
      lgss.pincode_group_id,
      lgss.day_of_week,
      lgss.shift_id,
      s.shift_name
    FROM laundry_group_shift_schedule lgss
    JOIN shifts s ON s.id = lgss.shift_id
    WHERE lgss.laundry_id = $1
      AND lgss.day_of_week = $2
      AND COALESCE(s.status, TRUE) IS TRUE
    ORDER BY s.start_time ASC, lgss.id ASC
    LIMIT 1
    `,
    [vendor_id, dayOfWeek],
  );

  const daySchedule = dayScheduleResult.rows[0] || scheduleRow;
  if (daySchedule) {
    shiftId = Number(daySchedule.shift_id);
    shiftName = daySchedule.shift_name;
    pincodeGroupId = Number(daySchedule.pincode_group_id);
    dayOfWeek = Number(daySchedule.day_of_week);
  }

  return {
    date: deadlineDate,
    day_of_week: dayOfWeek,
    day_label: DAY_LABELS[dayOfWeek] || null,
    shift_id: shiftId,
    shift_name: shiftName,
    pincode_group_id: pincodeGroupId,
  };
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
      o.pickup_completed_at,
      o.delivery_completed_at,
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

const buildEmptyTaskDeadline = () => ({
  date: null,
  day_of_week: null,
  day_label: null,
  shift_id: null,
  shift_name: null,
  pincode_group_id: null,
});

export const orderTaskDashboardService = async (vendor_id) => {
  const taskDeadline = (await resolveVendorTaskDeadline(vendor_id)) || buildEmptyTaskDeadline();
  const orders = await fetchVendorTaskOrders(vendor_id, taskDeadline);

  return {
    filter: 'task',
    generated_at: formatGeneratedAtIso(),
    task_deadline: taskDeadline,
    task_progress: buildTaskProgress(orders),
    performance_overview: buildTaskPerformanceOverview(orders),
    todays_batch_overview: {
      total_orders: orders.length,
      services: buildDashboardBatchServices(orders),
    },
    operational_distribution: buildTaskOperationalDistribution(orders),
  };
};

export const getVendorTaskOrdersService = async (vendor_id) => {
  const taskDeadline = (await resolveVendorTaskDeadline(vendor_id)) || buildEmptyTaskDeadline();
  const orders = await fetchVendorTaskOrders(vendor_id, taskDeadline);
  const shiftType = taskDeadline.shift_name
    ? String(taskDeadline.shift_name).trim().toLowerCase()
    : null;

  const shiftPayload = {
    id: taskDeadline.shift_id,
    shift_title: taskDeadline.shift_name,
    total_orders: orders.length,
    shift_type: shiftType,
    operational_distribution: buildTaskOperationalDistribution(orders),
    todays_batch_overview: {
      total_orders: orders.length,
      services: buildDashboardBatchServices(orders),
    },
    orders: orders.map(mapTaskOrderToListItem),
  };

  return {
    mode: 'task',
    task_deadline: taskDeadline,
    task_progress: buildTaskProgress(orders),
    shifts: taskDeadline.shift_id || orders.length ? [shiftPayload] : [],
  };
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_PERIODS = ['today', 'month', 'custom'];

const resolveHistoryDateRange = ({ period, date, date_from, date_to } = {}) => {
  const today = formatDate(new Date());
  const normalizedPeriod = HISTORY_PERIODS.includes(String(period || '').toLowerCase())
    ? String(period).toLowerCase()
    : 'today';

  if (normalizedPeriod === 'today') {
    const day = date && DATE_RE.test(date) ? date : today;
    return { period: 'today', date_from: day, date_to: day };
  }

  if (normalizedPeriod === 'month') {
    if (
      date_from &&
      date_to &&
      DATE_RE.test(date_from) &&
      DATE_RE.test(date_to)
    ) {
      if (date_from > date_to) {
        throw { status: 400, message: 'date_from must be on or before date_to' };
      }
      return { period: 'month', date_from, date_to };
    }

    const now = new Date();
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { period: 'month', date_from: start, date_to: end };
  }

  if (!date_from || !date_to || !DATE_RE.test(date_from) || !DATE_RE.test(date_to)) {
    throw {
      status: 400,
      message: 'date_from and date_to (YYYY-MM-DD) are required for custom period',
    };
  }

  if (date_from > date_to) {
    throw { status: 400, message: 'date_from must be on or before date_to' };
  }

  return { period: 'custom', date_from, date_to };
};

const mapHistoryOrderToListItem = (order) => {
  const serviceConfig = SERVICE_CONFIG[order.service_id] || {
    image: order.service_image || null,
  };

  return {
    id: order.id,
    customer: `CUST${String(order.user_id).padStart(3, '0')}`,
    type: isExpressOrder(order.service_type_name) ? 'Express' : 'Regular',
    details: buildOrderDetails(order),
    image: serviceConfig.image || order.service_image,
    status: getVendorOperationalStatus(order),
  };
};

const buildHistoryShiftPayload = (slotId, orders, shiftByPickupSlot) => {
  const config = shiftByPickupSlot[slotId];
  if (!config) return null;

  const shiftOrders = orders.filter(
    (o) => Number(o.pickup_slot_id) === Number(slotId),
  );
  if (!shiftOrders.length) return null;

  const titleLabel =
    config.shift_type.charAt(0).toUpperCase() + config.shift_type.slice(1);

  return {
    id: Number(slotId),
    shift_title: titleLabel,
    total_orders: shiftOrders.length,
    shift_type: config.shift_type,
    orders: shiftOrders.map(mapHistoryOrderToListItem),
  };
};

export const getVendorHistoryOrdersService = async (vendor_id, query = {}) => {
  const { period, date_from, date_to } = resolveHistoryDateRange(query);
  const { pickupShiftSlotIds, shiftByPickupSlot } =
    await getPickupShiftConfig();

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
      s.name AS service_name,
      s.image AS service_image,
      st.name AS service_type_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.vendor_received_at::date BETWEEN $2::date AND $3::date
      AND o.pickup_slot_id = ANY($4::int[])
      AND o.status NOT IN ('draft', 'cancelled')
    ORDER BY o.id DESC
    `,
    [vendor_id, date_from, date_to, pickupShiftSlotIds],
  );

  const shifts = pickupShiftSlotIds
    .map((slotId) => buildHistoryShiftPayload(slotId, orders, shiftByPickupSlot))
    .filter(Boolean);

  return {
    mode: 'history',
    period,
    date_from,
    date_to,
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

export const getVendorOrdersService = async (vendor_id, selectedDate) => {
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

  return {
    selected_date: date,
    shifts: pickupShiftSlotIds.map((slotId) =>
      buildShiftPayload(slotId, orders, lotCode, shiftByPickupSlot),
    ),
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
      o.vendor_request_amount,
      o.vendor_request_markup,
      o.vendor_revenue,
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
    vendor_request_amount: order.vendor_request_amount
      ? parseFloat(order.vendor_request_amount)
      : null,
    vendor_request_markup: order.vendor_request_markup
      ? parseFloat(order.vendor_request_markup)
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
  const { actual_weight, is_stained, stain_images, vendor_request_amount } = payload;

  const orderCheck = await sql.query(
    `SELECT o.id, o.status, o.base_price_per_kg, o.extra_price_per_kg, o.flat_fee,
            o.peak_extra_charge, o.applied_coupon_id,
            o.estimated_weight_min, o.estimated_weight_max, o.estimated_total,
            o.amount_paid, c.discount_type, c.discount_value, c.minimum_amount_value,
            c.maximum_amount_value,
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

  const images = Array.isArray(stain_images)
    ? stain_images.filter((path) => typeof path === 'string' && path.trim())
    : [];

  if (stained === 1) {
    if (images.length === 0) {
      throw { status: 400, message: 'At least one image is required when is_stained is 1' };
    }
    const amount = parseFloat(vendor_request_amount);
    if (!vendor_request_amount || Number.isNaN(amount) || amount <= 0) {
      throw { status: 400, message: 'vendor_request_amount must be a positive number when is_stained is 1' };
    }
  }

  const order = orderCheck.rows[0];
  const weight = parseFloat(actual_weight);
  const weight_min = Number(order.estimated_weight_min);
  const weight_max = Number(order.estimated_weight_max);
  const within_range = weight <= weight_max;

  let gross_base_total;
  let extra_weight_charge = 0;
  let pricing_note;

  if (within_range) {
    gross_base_total = Number(order.estimated_total);
    pricing_note = 'within_estimate';
  } else {
    const extra_kg = weight - weight_max;
    const rate_per_kg = Number(order.base_price_per_kg) + Number(order.extra_price_per_kg);
    extra_weight_charge = parseFloat((extra_kg * rate_per_kg).toFixed(2));
    gross_base_total = parseFloat(
      (Number(order.estimated_total) + extra_weight_charge).toFixed(2),
    );
    pricing_note = 'exceeded_estimate';
  }

  const { discount, net_total: base_total } = applyCouponDiscount(
    gross_base_total,
    order,
  );

  const resolvedImages = stained === 1 ? images : null;
  const resolvedAmount = stained === 1 ? parseFloat(vendor_request_amount) : null;
  const ratePerKg = Number(order.vendor_per_kg_amount || 90);
  // Vendor payout = per-kg earnings + their stain request (markup is platform side)
  const vendor_revenue = parseFloat(
    (weight * ratePerKg + (resolvedAmount || 0)).toFixed(2),
  );
  const vendor_request_markup =
    stained === 1 ? parseFloat((resolvedAmount * 0.3).toFixed(2)) : null;

  const subtotalBeforeGst = parseFloat(
    (base_total + (resolvedAmount || 0) + (vendor_request_markup || 0)).toFixed(2),
  );
  const { gst, final_total } = applyGst(subtotalBeforeGst);
  const remaining_amount = parseFloat(final_total - order.amount_paid);
  // console.log('Remaining amount after GST:', remaining_amount);

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
         status = 'in_process',
         updated_at = NOW()
     WHERE id = $10`,
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
      order_id,
    ]
  );

  return {
    order_id:      parseInt(order_id),
    actual_weight: weight,
    estimated_range: { min: weight_min, max: weight_max },
    pricing_note,
    gross_base_total,
    extra_weight_charge,
    coupon_discount: discount,
    base_total,
    vendor_request_amount: resolvedAmount,
    vendor_request_markup,
    vendor_revenue,
    subtotal_before_gst: subtotalBeforeGst,
    gst,
    gst_rate: 18,
    final_total,
    is_stained: stained,
    stain_images: resolvedImages,
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
