import sql from '../../config/db.js';
import { buildOrderTimestamps, formatDateTime } from '../../utils/datetime.util.js';
import { buildOrderBillingPayload } from '../../utils/orderBilling.util.js';
import {
  isValidOpsIssueType,
  resolveOpsIssueType,
} from '../../utils/opsIssue.util.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
};

const formatDate = (date) => date.toLocaleDateString('en-CA');

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
  const issueType = query.issue_type
    ? String(query.issue_type).toLowerCase()
    : null;

  if (issueType && !isValidOpsIssueType(issueType)) {
    throw {
      status: 400,
      message:
        'issue_type must be one of failed_pickup, failed_drop, missed_pickup, missed_drop',
    };
  }

  if (dateFrom && dateTo && DATE_RE.test(dateFrom) && DATE_RE.test(dateTo)) {
    if (dateFrom > dateTo) {
      throw { status: 400, message: 'date_from must be on or before date_to' };
    }
    return {
      start: dateFrom,
      end: dateTo,
      period: VALID_PERIODS.includes(query.period) ? query.period : 'today',
      orderStatus: query.order_status || null,
      issueType,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    orderStatus: query.order_status || null,
    issueType,
  };
};

const formatDateLabel = (start, end) => {
  const shortOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };

  const startDate = new Date(`${start}T12:00:00`);

  if (start === end) {
    return startDate.toLocaleDateString('en-GB', shortOptions);
  }

  const endDate = new Date(`${end}T12:00:00`);
  const startPart = startDate.toLocaleDateString('en-GB', shortOptions);
  const endPart = endDate.toLocaleDateString('en-GB', shortOptions);
  return `${startPart} - ${endPart}`;
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

const getOperationalCounts = (orders) => ({
  pending_classification: orders.filter(isClassificationPending).length,
  in_processing: orders.filter(
    (o) =>
      o.status === 'order_finalized' ||
      (o.status === 'in_process' && !isClassificationPending(o)),
  ).length,
  ready_for_dispatch: orders.filter((o) =>
    ['ready_for_delivery', 'out_for_delivery'].includes(o.status),
  ).length,
});

const buildTopStats = (orders) => {
  const ops = getOperationalCounts(orders);

  return [
    { key: 'orders_received', value: orders.length },
    { key: 'pending_classification', value: ops.pending_classification },
    { key: 'in_processing', value: ops.in_processing },
    { key: 'ready_for_dispatch', value: ops.ready_for_dispatch },
    {
      key: 'order_complete',
      value: orders.filter((o) => o.status === 'delivered').length,
    },
  ];
};

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const getAdminDisplayStatus = (status) => {
  if (status === 'in_process') return 'in_progress';
  return status;
};

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
  return `${est}/${fin}`;
};

const buildCharges = (order) => {
  const amount = order.final_total ?? order.estimated_total ?? 0;
  return String(Math.round(Number(amount)));
};

const mapAdminOrder = (order) => {
  const issueType = resolveIssueType(order);

  return {
    id: String(order.id),
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    customer_id: `CUS-${order.user_id}`,
    service_type: getServiceKey(order.service_id),
    status: getAdminDisplayStatus(order.status),
    ...(issueType ? { issue_type: issueType } : {}),
    est_fin: buildEstFin(order),
    charges: buildCharges(order),
  };
};

const buildServiceSummary = (orders) => {
  const washOrders = orders.filter((o) => Number(o.service_id) === 1);
  const dryOrders = orders.filter((o) => Number(o.service_id) === 2);
  const summary = [];

  if (washOrders.length) {
    const estKg = washOrders.reduce(
      (sum, o) =>
        sum + getEstimatedKg(o.estimated_weight_min, o.estimated_weight_max),
      0,
    );
    const finKg = washOrders.reduce(
      (sum, o) => sum + Number(o.actual_weight || 0),
      0,
    );

    summary.push({
      key: 'wash_by_kilo',
      subtitle: `Est. ${Math.round(estKg)} kg - Fin. ${Math.round(finKg)} kg`,
      regular_orders: washOrders.filter((o) => !isExpressOrder(o.service_type_name))
        .length,
      express_orders: washOrders.filter((o) => isExpressOrder(o.service_type_name))
        .length,
    });
  }

  if (dryOrders.length) {
    const totalItems = dryOrders.reduce(
      (sum, o) => sum + Number(o.clothes_count || 0),
      0,
    );

    summary.push({
      key: 'dry_clean',
      subtitle: `Total items - ${totalItems} pcs`,
      regular_orders: dryOrders.filter((o) => !isExpressOrder(o.service_type_name))
        .length,
      express_orders: dryOrders.filter((o) => isExpressOrder(o.service_type_name))
        .length,
    });
  }

  return summary;
};

const buildMetricChips = (orders) => {
  const ops = getOperationalCounts(orders);

  return [
    { key: 'pending_classification', value: ops.pending_classification },
    { key: 'in_processing', value: ops.in_processing },
    { key: 'ready_for_dispatch', value: ops.ready_for_dispatch },
  ];
};

const buildShiftPayload = (slotId, orders, lotCode, shiftKey) => {
  const shiftOrders = orders.filter(
    (o) => Number(o.pickup_slot_id) === Number(slotId),
  );

  return {
    key: shiftKey,
    lot: lotCode,
    total_orders: shiftOrders.length,
    metric_chips: buildMetricChips(shiftOrders),
    service_summary: buildServiceSummary(shiftOrders),
    orders: shiftOrders.map(mapAdminOrder),
  };
};

const fetchOrders = async (start, end, orderStatus, pickupShiftSlotIds, includeCancelled) => {
  const params = [start, end, pickupShiftSlotIds];
  let statusClause = '';

  if (orderStatus) {
    params.push(orderStatus);
    statusClause = `AND o.status = $${params.length}`;
  } else if (includeCancelled) {
    statusClause = `AND o.status <> 'draft'`;
  } else {
    statusClause = `AND o.status NOT IN ('draft', 'cancelled')`;
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.pickup_slot_id,
      o.pickup_date,
      o.delivery_date,
      o.status,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.actual_weight,
      o.actual_clothes_count,
      o.clothes_count,
      o.service_id,
      o.estimated_total,
      o.final_total,
      o.out_for_pickup_at,
      o.pickup_started_at,
      o.out_for_delivery_at,
      st.name AS service_type_name,
      ir.issue_type AS open_issue_type,
      oc.reason_type AS cancel_reason_type
    FROM orders o
    LEFT JOIN service_types st ON o.service_type_id = st.id
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
    WHERE o.pickup_date BETWEEN $1::date AND $2::date
      AND o.pickup_slot_id = ANY($3::int[])
      ${statusClause}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

export const getAdminOrdersService = async (query = {}) => {
  const { start, end, period, orderStatus, issueType } = resolveFilters(query);
  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();

  const orders = await fetchOrders(
    start,
    end,
    orderStatus,
    pickupShiftSlotIds,
    Boolean(issueType),
  );

  const filteredOrders = issueType
    ? orders.filter((order) => resolveOpsIssueType(order) === issueType)
    : orders;

  const shifts = pickupShiftSlotIds.map((slotId, index) => {
    const config = shiftByPickupSlot[slotId];
    const lotCode = `LOT-${String(index + 1).padStart(3, '0')}`;
    const shiftKey = config?.shift_type || `shift_${index + 1}`;

    return buildShiftPayload(slotId, filteredOrders, lotCode, shiftKey);
  });

  return {
    period,
    date_label: formatDateLabel(start, end),
    top_stats: buildTopStats(filteredOrders),
    shifts,
  };
};

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

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

const buildPickupSection = (shiftName, riderName, riderId, otpVerified, pickupCompletedAt) => {
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

const buildDeliverySection = (shiftName, riderName, riderId, deliveryCompleted, deliveryCompletedAt) => {
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
  const successfulPayments = payments.filter((payment) => payment.status === 'success');
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
  const outstanding = Math.max(0, Math.round(totalDue - preBookingPayment - remainingPaid));

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
      vendor_revenue:
        order.vendor_revenue != null
          ? parseFloat(order.vendor_revenue)
          : null,
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
