import sql from '../../config/db.js';
import {
  ORDER_ZONE_JOINS,
  orderZoneCityFilterSql,
  resolveGeoFilters,
} from '../../utils/adminGeoFilter.util.js';
import { buildOrderTimestamps, formatDateTime } from '../../utils/datetime.util.js';
import { buildOrderBillingPayload } from '../../utils/orderBilling.util.js';
import { resolveOpsIssueType } from '../../utils/opsIssue.util.js';
import { paginateArray } from '../../utils/pagination.util.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';

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

const resolveListFilters = (query = {}) => {
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

  const selectedDate =
    parseOptionalDate(query.date, 'date') || dateFrom || formatDate(new Date());

  return {
    selectedDate,
    dateFrom,
    dateTo,
    shift: parseOptionalShift(query.shift),
  };
};

const normalizeStainImages = (value) => {
  let list = value;

  if (typeof list === "string" && list.trim()) {
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
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const path = String(item.path || item.url || item.image || "").trim();
        return path || null;
      }
      return null;
    })
    .filter(Boolean);

  return images.length ? images : null;
};

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

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const resolveIssueType = (order) => {
  const opsIssue = resolveOpsIssueType(order);
  if (opsIssue) return opsIssue;

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

const getOrderTotal = (order) =>
  Math.round(Number(order.final_total ?? order.estimated_total ?? 0));

const getBalanceCollected = (order) =>
  Math.round(Number(order.amount_paid ?? order.paid_sum ?? 0));

const getBalancePayable = (order) => {
  if (order.remaining_amount != null) {
    return Math.max(0, Math.round(Number(order.remaining_amount)));
  }
  return Math.max(0, getOrderTotal(order) - getBalanceCollected(order));
};

const resolveShiftKey = (shiftName) => {
  if (!shiftName) return null;
  return String(shiftName).trim().toLowerCase().split(/\s+/)[0];
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

const isPickupOnDate = (order, dateStr) => toDateStr(order.pickup_date) === dateStr;
const isDeliveryOnDate = (order, dateStr) =>
  toDateStr(order.delivery_date) === dateStr;

const isActiveOnDate = (order, dateStr) =>
  isPickupOnDate(order, dateStr) || isDeliveryOnDate(order, dateStr);

const buildDays = (selectedDate, orders) => {
  const days = [];

  for (let i = 0; i < DAYS_WINDOW; i += 1) {
    const date = addDays(selectedDate, i);
    const pickupToday = orders.filter((o) => isPickupOnDate(o, date)).length;
    const deliveryToday = orders.filter((o) => isDeliveryOnDate(o, date)).length;

    days.push({
      date,
      total_plan: pickupToday + deliveryToday,
    });
  }

  return days;
};

const buildKpis = (selectedDate, orders) => {
  const pickupOrders = orders.filter((o) => isPickupOnDate(o, selectedDate));
  const deliveryOrders = orders.filter((o) =>
    isDeliveryOnDate(o, selectedDate),
  );

  // Payment KPIs: distinct orders active on this day (pickup or delivery)
  const dayOrdersMap = new Map();
  for (const order of [...pickupOrders, ...deliveryOrders]) {
    dayOrdersMap.set(order.id, order);
  }
  const dayOrders = [...dayOrdersMap.values()];

  return {
    total_plan: pickupOrders.length + deliveryOrders.length,
    pickup_today: pickupOrders.length,
    pickup_completed: pickupOrders.filter(
      (o) => resolvePickupStatus(o) === 'completed',
    ).length,
    delivery_today: deliveryOrders.length,
    delivery_completed: deliveryOrders.filter(
      (o) => resolveDeliveryStatus(o) === 'completed',
    ).length,
    total_payable: dayOrders.reduce((sum, o) => sum + getOrderTotal(o), 0),
    balance_collected: dayOrders.reduce(
      (sum, o) => sum + getBalanceCollected(o),
      0,
    ),
    balance_pending: dayOrders.reduce((sum, o) => sum + getBalancePayable(o), 0),
    failed_pickup: pickupOrders.filter((o) => resolvePickupStatus(o) === 'failed')
      .length,
    failed_delivery: deliveryOrders.filter(
      (o) => resolveDeliveryStatus(o) === 'failed',
    ).length,
  };
};

const mapAdminOrderRow = (order, selectedDate, shiftByPickupSlot) => {
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
    charges: getOrderTotal(order),
    pickup_status: resolvePickupStatus(order),
    delivery_status: resolveDeliveryStatus(order),
    total_payable: getOrderTotal(order),
    balance_collected: getBalanceCollected(order),
    balance_payable: getBalancePayable(order),
    scheduled_date: scheduledDate,
  };
};

const fetchOrdersForRange = async ({
  rangeStart,
  rangeEnd,
  pincodeGroupId,
  cityId,
  shiftSlotIds,
}) => {
  const params = [rangeStart, rangeEnd, pincodeGroupId, cityId];
  let shiftClause = '';

  if (shiftSlotIds?.length) {
    params.push(shiftSlotIds);
    shiftClause = `AND o.pickup_slot_id = ANY($${params.length}::int[])`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      u.full_name AS customer_name,
      o.pickup_slot_id,
      o.pickup_date,
      o.delivery_date,
      o.created_at,
      o.status,
      o.payment_status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.service_id,
      o.estimated_total,
      o.final_total,
      o.amount_paid,
      o.remaining_amount,
      o.out_for_pickup_at,
      o.pickup_started_at,
      o.out_for_delivery_at,
      pickup_ts.shift_name AS pickup_shift_name,
      COALESCE(ps.paid_sum, 0) AS paid_sum,
      ir.issue_type AS open_issue_type,
      oc.reason_type AS cancel_reason_type
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN time_slots pickup_ts ON pickup_ts.id = o.pickup_slot_id
    ${ORDER_ZONE_JOINS}
    LEFT JOIN (
      SELECT
        order_id,
        SUM(amount) FILTER (WHERE status = 'success') AS paid_sum
      FROM payments
      GROUP BY order_id
    ) ps ON ps.order_id = o.id
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
    WHERE o.status <> 'draft'
      AND (
        o.pickup_date BETWEEN $1::date AND $2::date
        OR o.delivery_date BETWEEN $1::date AND $2::date
      )
      AND ${orderZoneCityFilterSql(3, 4)}
      ${shiftClause}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

export const getAdminOrdersService = async (query = {}) => {
  const { selectedDate, dateFrom, dateTo, shift } = resolveListFilters(query);
  const geoFilter = await resolveGeoFilters(query);
  const pincodeGroupId = geoFilter.pincode_group_id;
  const cityId = geoFilter.city_id;

  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();

  let shiftSlotIds = null;
  if (shift) {
    shiftSlotIds = pickupShiftSlotIds.filter((slotId) => {
      const meta = shiftByPickupSlot[slotId];
      return resolveShiftKey(meta?.shift_type) === shift;
    });
  }

  const rangeStart = selectedDate;
  const rangeEnd = addDays(selectedDate, DAYS_WINDOW - 1);

  const orders = await fetchOrdersForRange({
    rangeStart,
    rangeEnd,
    pincodeGroupId,
    cityId,
    shiftSlotIds,
  });

  const selectedOrders = orders.filter((order) =>
    isActiveOnDate(order, selectedDate),
  );

  const mappedOrders = selectedOrders.map((order) =>
    mapAdminOrderRow(order, selectedDate, shiftByPickupSlot),
  );
  const { items: pageOrders, pagination } = paginateArray(mappedOrders, query);

  return {
    filters: {
      date: selectedDate,
      date_from: dateFrom,
      date_to: dateTo,
      shift,
      pincode_group_id: pincodeGroupId,
      zone_group: geoFilter.zone_name,
      city_id: cityId,
      city_name: geoFilter.city_name,
    },
    days: buildDays(selectedDate, orders),
    selected_date: selectedDate,
    kpis: buildKpis(selectedDate, orders),
    orders: pageOrders,
    pagination,
  };
};

const formatEntityId = (prefix, id) =>
  `${prefix}-${String(id).padStart(3, '0')}`;

const formatRiderLabel = (name, id) =>
  name ? `${name} | ${formatEntityId('RID', id)}` : null;

const formatMerchantLabel = (name, id) =>
  name ? `${name} | ${formatEntityId('MER', id)}` : null;

const formatServiceCategory = (serviceTypeName) => {
  if (!serviceTypeName) return null;
  return serviceTypeName.replace(/\s+Service$/i, '').trim();
};

const formatDisplayDate = (dateValue) => {
  if (!dateValue) return null;
  const date =
    dateValue instanceof Date
      ? dateValue
      : new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatShiftLabel = (shiftName) => {
  if (!shiftName) return null;
  const normalized = String(shiftName).trim();
  if (/shift$/i.test(normalized)) return normalized;
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} Shift`;
};

const formatShiftType = (shiftName) =>
  shiftName ? String(shiftName).trim().toLowerCase() : null;

const formatCountLabel = (count, unit = 'items') => {
  const value = Number(count || 0);
  return `${value} ${unit}`;
};

const formatWeightEstimate = (min, max) => {
  const estKg = getEstimatedKg(min, max);
  return `Est. ${estKg}kg`;
};

const formatWeightDifference = (actualWeight, min, max) => {
  if (actualWeight == null) return 'N/A';
  const estimated = getEstimatedKg(min, max);
  const diff = parseFloat((Number(actualWeight) - estimated).toFixed(1));
  if (diff === 0) return '0kg';
  return `${diff > 0 ? '+' : ''}${diff}kg`;
};

const formatOtpStatus = (verified) => (verified ? 'Verified' : 'Pending');

const resolveLotForPickupSlot = (pickupSlotId, pickupShiftSlotIds) => {
  const index = pickupShiftSlotIds.indexOf(Number(pickupSlotId));
  if (index === -1) return null;
  return `LOT-${String(index + 1).padStart(3, '0')}`;
};

const fetchAdminOrderById = async (orderId) => {
  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.service_id,
      o.status,
      o.payment_status,
      o.pickup_slot_id,
      o.delivery_slot_id,
      o.pickup_date,
      o.delivery_date,
      o.clothes_count,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.base_price_per_kg,
      o.extra_price_per_kg,
      o.flat_fee,
      o.peak_extra_charge,
      o.estimated_total,
      o.final_total,
      o.is_stained,
      o.stain_images,
      o.vendor_request_amount,
      o.vendor_request_markup,
      o.vendor_revenue,
      o.vendor_amount_per_kg,
      o.applied_coupon_id,
      c.coupon_code,
      c.discount_type,
      c.discount_value,
      c.minimum_amount_value,
      c.maximum_amount_value,
      o.otp_verified,
      o.created_at,
      o.updated_at,
      o.otp_generated_at,
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
      o.delivered_at,
      o.vendor_id,
      o.assigned_rider_id,
      u.full_name AS customer_name,
      s.name AS service_name,
      st.name AS service_type_name,
      pickup_ts.shift_name AS pickup_shift_name,
      delivery_ts.shift_name AS delivery_shift_name,
      r.full_name AS rider_name,
      v.laundry_shop_name AS vendor_name
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN time_slots pickup_ts ON o.pickup_slot_id = pickup_ts.id
    LEFT JOIN time_slots delivery_ts ON o.delivery_slot_id = delivery_ts.id
    LEFT JOIN riders r ON o.assigned_rider_id = r.id
    LEFT JOIN vendors v ON o.vendor_id = v.id
    LEFT JOIN coupons c ON o.applied_coupon_id = c.id
    WHERE o.id = $1
      AND o.status NOT IN ('draft', 'cancelled')
  `,
    [orderId],
  );

  return rows[0] || null;
};

const fetchOrderPayments = async (orderId) => {
  const { rows } = await sql.query(
    `
    SELECT amount, payment_type, payment_method, status
    FROM payments
    WHERE order_id = $1
    ORDER BY created_at ASC
  `,
    [orderId],
  );

  return rows;
};

const fetchOpenIssueCount = async (orderId) => {
  const { rows } = await sql.query(
    `
    SELECT COUNT(*)::int AS count
    FROM order_reports
    WHERE order_id = $1 AND status = 'open'
  `,
    [orderId],
  );

  return rows[0]?.count || 0;
};

const buildPickupSection = (
  shiftName,
  riderName,
  riderId,
  otpVerified,
  pickupCompletedAt,
) => {
  const pickupCompletedFormatted = formatDateTime(pickupCompletedAt);

  return {
    rider: formatRiderLabel(riderName, riderId),
    otp_status: formatOtpStatus(otpVerified),
    shift: formatShiftLabel(shiftName),
    shift_type: formatShiftType(shiftName),
    timestamp: pickupCompletedFormatted || 'Pending',
    pickup_completed_at: pickupCompletedFormatted,
  };
};

const buildDeliverySection = (
  shiftName,
  riderName,
  riderId,
  deliveryCompleted,
  deliveryCompletedAt,
) => {
  const deliveryCompletedFormatted = formatDateTime(deliveryCompletedAt);

  return {
    rider: formatRiderLabel(riderName, riderId),
    otp_status: deliveryCompleted ? 'Verified' : 'Pending',
    shift: formatShiftLabel(shiftName),
    shift_type: formatShiftType(shiftName),
    timestamp: deliveryCompletedFormatted || 'Pending',
    delivery_completed_at: deliveryCompletedFormatted,
  };
};

const buildBillingPayload = buildOrderBillingPayload;

const buildPaymentPayload = (order, billing, payments) => {
  const successfulPayments = payments.filter(
    (payment) => payment.status === 'success',
  );
  const advancePayments = successfulPayments.filter(
    (payment) => payment.payment_type === 'advance',
  );
  const remainingPayments = successfulPayments.filter(
    (payment) => payment.payment_type === 'remaining',
  );

  const preBookingPayment = advancePayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const remainingPaid = remainingPayments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  const paymentMethod = advancePayments[0]?.payment_method || null;
  const modeOfPayment = paymentMethod || 'N/A';

  const totalDue = Number(billing.total_amount);
  const outstanding = Math.max(
    0,
    Math.round(totalDue - preBookingPayment - remainingPaid),
  );

  return {
    pre_booking_payment: String(Math.round(preBookingPayment)),
    mode_of_payment: modeOfPayment,
    outstanding_amount: String(outstanding),
  };
};

export const getAdminOrderDetailsService = async (orderId) => {
  const order = await fetchAdminOrderById(orderId);

  if (!order) {
    throw { status: 404, message: 'Order not found' };
  }

  const { pickupShiftSlotIds } = await getPickupShiftConfig();
  const lot = resolveLotForPickupSlot(order.pickup_slot_id, pickupShiftSlotIds);
  const pickupVerified = Boolean(order.otp_verified);
  const deliveryCompleted = order.status === 'delivered';

  return {
    id: order.id,
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    status: getAdminDisplayStatus(order.status),
    payment_status: order.payment_status || 'pending',
    batch: {
      lot,
      shift: formatShiftLabel(order.pickup_shift_name),
      shift_type: formatShiftType(order.pickup_shift_name),
    },
    service: {
      name: order.service_name,
      category: formatServiceCategory(order.service_type_name),
    },
    customer_booking: {
      customer_name: order.customer_name,
      customer_id: formatCustomerId(order.user_id),
      declared_count: formatCountLabel(order.clothes_count),
      estimated_weight: formatWeightEstimate(
        order.estimated_weight_min,
        order.estimated_weight_max,
      ),
      pickup_date: formatDisplayDate(order.pickup_date),
      pickup_shift: formatShiftLabel(order.pickup_shift_name),
      pickup_shift_type: formatShiftType(order.pickup_shift_name),
      notes: 'N/A',
    },
    pickup: buildPickupSection(
      order.pickup_shift_name,
      order.rider_name,
      order.assigned_rider_id,
      pickupVerified,
      order.pickup_completed_at,
    ),
    delivery: buildDeliverySection(
      order.delivery_shift_name,
      order.rider_name,
      order.assigned_rider_id,
      deliveryCompleted,
      order.delivery_completed_at,
    ),
    timestamps: buildOrderTimestamps(order),
  };
};

export const getAdminOrderOperationsService = async (orderId) => {
  const order = await fetchAdminOrderById(orderId);

  if (!order) {
    throw { status: 404, message: 'Order not found' };
  }

  const [payments, openIssueCount] = await Promise.all([
    fetchOrderPayments(orderId),
    fetchOpenIssueCount(orderId),
  ]);

  const billing = buildBillingPayload(order);
  const verifiedCount =
    order.actual_clothes_count != null
      ? formatCountLabel(order.actual_clothes_count, 'Items')
      : 'N/A';
  const actualWeight =
    order.actual_weight != null
      ? `${parseFloat(Number(order.actual_weight).toFixed(1))}kg`
      : 'N/A';

  return {
    id: order.id,
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    merchant_assessment: {
      merchant: formatMerchantLabel(order.vendor_name, order.vendor_id),
      verified_count: verifiedCount,
      actual_weight: actualWeight,
      count_difference: formatWeightDifference(
        order.actual_weight,
        order.estimated_weight_min,
        order.estimated_weight_max,
      ),
      is_stained: Number(order.is_stained) || 0,
      stain_images: normalizeStainImages(order.stain_images),
      vendor_request_amount:
        order.vendor_request_amount != null
          ? parseFloat(order.vendor_request_amount)
          : null,
      vendor_request_markup:
        order.vendor_request_markup != null
          ? parseFloat(order.vendor_request_markup)
          : null,
      vendor_amount_per_kg:
        order.vendor_amount_per_kg != null
          ? parseFloat(order.vendor_amount_per_kg)
          : null,
      vendor_revenue:
        order.vendor_revenue != null ? parseFloat(order.vendor_revenue) : null,
      extra_care_items:
        Number(order.is_stained) === 1
          ? '1 Item Stained'
          : openIssueCount > 0
            ? `${openIssueCount} Item${openIssueCount === 1 ? '' : 's'} Flagged`
            : 'N/A',
      non_serviceable_items: 'N/A',
    },
    billing,
    payment: buildPaymentPayload(order, billing, payments),
    timestamps: buildOrderTimestamps(order),
  };
};
