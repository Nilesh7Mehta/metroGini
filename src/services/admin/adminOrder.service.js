import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';

const VALID_PERIODS = ['today', 'week', 'month'];

const SERVICE_CONFIG = {
  1: { key: 'wash_by_kilo' },
  2: { key: 'dry_clean' },
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

  if (dateFrom && dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return {
      start: dateFrom,
      end: dateTo,
      period: VALID_PERIODS.includes(query.period) ? query.period : 'custom',
      orderStatus: query.order_status || null,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    orderStatus: query.order_status || null,
  };
};

const formatDateLabel = (start, end) => {
  const labelOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };

  const startDate = new Date(`${start}T12:00:00`);

  if (start === end) {
    return startDate.toLocaleDateString('en-GB', labelOptions);
  }

  const endDate = new Date(`${end}T12:00:00`);
  const startPart = startDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const endPart = endDate.toLocaleDateString('en-GB', labelOptions);
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

const buildCharges = (order) => {
  const amount = order.final_total ?? order.estimated_total ?? 0;
  return String(Math.round(Number(amount)));
};

const mapAdminOrder = (order) => {
  const issueType = resolveIssueType(order);

  return {
    order_id: order.order_code || `ORD-${String(order.id).padStart(3, '0')}`,
    customer_id: `CUST${String(order.user_id).padStart(3, '0')}`,
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

const fetchOrders = async (start, end, orderStatus, pickupShiftSlotIds) => {
  const params = [start, end, pickupShiftSlotIds];
  let statusClause = '';

  if (orderStatus) {
    params.push(orderStatus);
    statusClause = `AND o.status = $${params.length}`;
  }

  const { rows } = await sql.query(
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
      o.estimated_total,
      o.final_total,
      st.name AS service_type_name,
      ir.issue_type AS open_issue_type
    FROM orders o
    LEFT JOIN service_types st ON o.service_type_id = st.id
    LEFT JOIN LATERAL (
      SELECT issue_type
      FROM order_reports
      WHERE order_id = o.id AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    ) ir ON TRUE
    WHERE o.pickup_date BETWEEN $1::date AND $2::date
      AND o.pickup_slot_id = ANY($3::int[])
      AND o.status NOT IN ('draft', 'cancelled')
      ${statusClause}
    ORDER BY o.pickup_slot_id ASC, o.id ASC
    `,
    params,
  );

  return rows;
};

export const getAdminOrdersService = async (query = {}) => {
  const { start, end, period, orderStatus } = resolveFilters(query);
  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();

  const orders = await fetchOrders(start, end, orderStatus, pickupShiftSlotIds);

  const shifts = pickupShiftSlotIds.map((slotId, index) => {
    const config = shiftByPickupSlot[slotId];
    const lotCode = `LOT-${String(index + 1).padStart(3, '0')}`;
    const shiftKey = config?.shift_type || `shift_${index + 1}`;

    return buildShiftPayload(slotId, orders, lotCode, shiftKey);
  });

  return {
    period: period === 'custom' ? 'today' : period,
    date_label: formatDateLabel(start, end),
    top_stats: buildTopStats(orders),
    shifts,
  };
};
