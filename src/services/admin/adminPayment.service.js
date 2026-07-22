import sql from '../../config/db.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';
import { paginateArray } from '../../utils/pagination.util.js';

const VALID_PERIODS = ['today', 'week', 'month'];
const VALID_PAYMENT_STATUSES = [
  'paid',
  'partially_paid',
  'pending',
  'failed',
  'refunded',
];

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
      paymentStatus: query.payment_status || null,
      method: query.method || null,
    };
  }

  const period = VALID_PERIODS.includes(query.period) ? query.period : 'today';
  const { start, end } = getDateRange(period);

  return {
    start,
    end,
    period,
    paymentStatus: query.payment_status || null,
    method: query.method || null,
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

const isExpressOrder = (serviceTypeName) =>
  typeof serviceTypeName === 'string' &&
  serviceTypeName.toLowerCase().includes('express');

const getServiceKey = (serviceId) =>
  SERVICE_CONFIG[Number(serviceId)]?.key || 'wash_by_kilo';

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const formatOrderId = (order) =>
  order.order_code || `ORD-${String(order.id).padStart(3, '0')}`;

const normalizeMethod = (method) => {
  if (!method) return null;
  return String(method).trim().toLowerCase().replace(/\s+/g, '_');
};

const resolveAction = (paymentStatus) => {
  if (paymentStatus === 'pending' || paymentStatus === 'partially_paid') {
    return 'send_reminder';
  }
  if (paymentStatus === 'failed') return 'resend_link';
  return 'view_details';
};

const formatShortPaymentDate = (paidAt) => {
  if (!paidAt) return null;
  const date = new Date(paidAt);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
};

const getOrderAmount = (order) =>
  Math.round(Number(order.final_total ?? order.estimated_total ?? 0));

const matchesPaymentStatusFilter = (order, paymentStatus) => {
  if (!paymentStatus) return true;
  return String(order.payment_status || 'pending').toLowerCase() === paymentStatus;
};

const getAdvanceAmount = (order) =>
  Math.round(Number(order.advance_amount || 0));

const buildStatusLabel = (paymentStatus, advanceAmount) => {
  if (paymentStatus === 'partially_paid') {
    return `Advance paid (${advanceAmount})`;
  }
  return null;
};

const fetchOrders = async (start, end, pickupShiftSlotIds, method) => {
  const params = [start, end, pickupShiftSlotIds];
  let methodClause = '';

  if (method) {
    params.push(normalizeMethod(method));
    methodClause = `
      AND EXISTS (
        SELECT 1
        FROM payments p
        WHERE p.order_id = o.id
          AND LOWER(REPLACE(COALESCE(p.payment_method, ''), ' ', '_')) = $${params.length}
      )
    `;
  }

  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.service_id,
      o.payment_status,
      o.pickup_slot_id,
      o.pickup_date,
      o.final_total,
      o.estimated_total,
      o.payment_completed_at,
      st.name AS service_type_name,
      lp.payment_method AS latest_payment_method,
      lp.paid_at AS latest_paid_at,
      COALESCE(ap.advance_amount, 0) AS advance_amount
    FROM orders o
    LEFT JOIN service_types st ON st.id = o.service_type_id
    LEFT JOIN LATERAL (
      SELECT payment_method, paid_at
      FROM payments
      WHERE order_id = o.id
        AND status = 'success'
      ORDER BY paid_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) lp ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(amount), 0) AS advance_amount
      FROM payments
      WHERE order_id = o.id
        AND payment_type = 'advance'
        AND status = 'success'
    ) ap ON TRUE
    WHERE o.pickup_date BETWEEN $1::date AND $2::date
      AND o.pickup_slot_id = ANY($3::int[])
      AND o.status NOT IN ('draft', 'cancelled')
      ${methodClause}
    ORDER BY o.id DESC
    `,
    params,
  );

  return rows;
};

const fetchTopStats = async (start, end) => {
  const { rows } = await sql.query(
    `
    WITH period_orders AS (
      SELECT
        o.id,
        o.final_total,
        o.estimated_total,
        o.status,
        o.payment_status,
        o.vendor_id,
        COALESCE(ps.advance_sum, 0) AS advance_sum,
        COALESCE(ps.paid_sum, 0) AS paid_sum
      FROM orders o
      LEFT JOIN (
        SELECT
          order_id,
          SUM(amount) FILTER (WHERE status = 'success') AS paid_sum,
          SUM(amount) FILTER (
            WHERE status = 'success' AND payment_type = 'advance'
          ) AS advance_sum
        FROM payments
        GROUP BY order_id
      ) ps ON ps.order_id = o.id
      WHERE o.pickup_date BETWEEN $1::date AND $2::date
        AND o.status NOT IN ('draft', 'cancelled')
    )
    SELECT
      COALESCE(SUM(COALESCE(final_total, estimated_total, 0)), 0) AS total_revenue,

      COALESCE(SUM(
        CASE
          WHEN payment_status = 'paid' THEN COALESCE(final_total, estimated_total, 0)
          WHEN payment_status = 'partially_paid' THEN advance_sum
          ELSE 0
        END
      ), 0) AS payments_received,

      COALESCE(SUM(
        CASE
          WHEN payment_status = 'pending' THEN COALESCE(final_total, estimated_total, 0)
          WHEN payment_status = 'partially_paid' THEN GREATEST(
            0,
            COALESCE(final_total, estimated_total, 0) - advance_sum
          )
          ELSE 0
        END
      ), 0) AS pending_payments,

      COALESCE(SUM(COALESCE(final_total, estimated_total, 0)) FILTER (
        WHERE payment_status = 'failed'
      ), 0) AS failed_payments,

      COALESCE(SUM(COALESCE(final_total, estimated_total, 0)) FILTER (
        WHERE status IN ('ready_for_delivery', 'out_for_delivery', 'delivered')
          AND payment_status = 'paid'
          AND vendor_id IS NOT NULL
      ), 0) AS merchant_payouts_due,

      COUNT(*) FILTER (WHERE payment_status = 'refunded')::int AS refunds_adjustments
    FROM period_orders
    `,
    [start, end],
  );

  const row = rows[0];

  return [
    { key: 'total_revenue', value: String(Math.round(Number(row.total_revenue))) },
    { key: 'payments_received', value: String(Math.round(Number(row.payments_received))) },
    { key: 'pending_payments', value: String(Math.round(Number(row.pending_payments))) },
    { key: 'failed_payments', value: String(Math.round(Number(row.failed_payments))) },
    {
      key: 'merchant_payouts_due',
      value: String(Math.round(Number(row.merchant_payouts_due))),
    },
    { key: 'refunds_adjustments', value: String(row.refunds_adjustments) },
  ];
};

const mapTransaction = (order) => {
  const paymentStatus = String(order.payment_status || 'pending').toLowerCase();
  const finalAmount = getOrderAmount(order);
  const advanceAmount = getAdvanceAmount(order);
  const remainingAmount = Math.max(0, finalAmount - advanceAmount);

  const transaction = {
    id: order.id,
    order_id: formatOrderId(order),
    customer_id: formatCustomerId(order.user_id),
    service_type: getServiceKey(order.service_id),
    service_category: isExpressOrder(order.service_type_name) ? 'express' : 'regular',
    amount: String(finalAmount),
    payment_status: paymentStatus,
    method: normalizeMethod(order.latest_payment_method),
    date:
      paymentStatus === 'paid'
        ? formatShortPaymentDate(
            order.payment_completed_at || order.latest_paid_at,
          )
        : null,
    action: resolveAction(paymentStatus),
  };

  if (paymentStatus === 'partially_paid') {
    transaction.status_label = buildStatusLabel(paymentStatus, advanceAmount);
    transaction.remaining = String(remainingAmount);
  }

  return transaction;
};

const resolveShiftStatus = (transactions) => {
  if (!transactions.length) return 'completed';
  const hasOpen = transactions.some((transaction) =>
    ['pending', 'partially_paid', 'failed'].includes(transaction.payment_status),
  );
  return hasOpen ? 'in_progress' : 'completed';
};

const buildShiftPayload = (slotId, orders, lotCode, shiftKey, filters) => {
  const shiftOrders = orders.filter(
    (row) => Number(row.pickup_slot_id) === Number(slotId),
  );

  const filteredOrders = shiftOrders.filter((row) =>
    matchesPaymentStatusFilter(row, filters.paymentStatus),
  );

  const transactions = filteredOrders.map(mapTransaction);

  return {
    key: shiftKey,
    lot: lotCode,
    status: resolveShiftStatus(transactions),
    total_orders: transactions.length,
    transactions,
  };
};

export const getAdminPaymentsService = async (query = {}) => {
  const filters = resolveFilters(query);

  if (
    filters.paymentStatus &&
    !VALID_PAYMENT_STATUSES.includes(filters.paymentStatus)
  ) {
    throw { status: 400, message: 'Invalid payment_status filter' };
  }

  const { pickupShiftSlotIds, shiftByPickupSlot } = await getPickupShiftConfig();
  const orders = await fetchOrders(
    filters.start,
    filters.end,
    pickupShiftSlotIds,
    filters.method,
  );
  const topStats = await fetchTopStats(filters.start, filters.end);

  const shifts = pickupShiftSlotIds.map((slotId, index) => {
    const config = shiftByPickupSlot[slotId];
    const lotCode = `LOT-${String(index + 1).padStart(3, '0')}`;
    const shiftKey = config?.shift_type || `shift_${index + 1}`;

    return buildShiftPayload(slotId, orders, lotCode, shiftKey, filters);
  });

  const allTransactions = shifts.flatMap((shift) =>
    (shift.transactions || []).map((tx) => ({
      ...tx,
      shift: shift.key,
      lot: shift.lot,
    })),
  );
  const { items: pageTransactions, pagination } = paginateArray(
    allTransactions,
    query,
  );

  // Keep shift shells; attach only this page's transactions
  const pageIds = new Set(pageTransactions.map((tx) => String(tx.id ?? tx.order_id)));
  const pagedShifts = shifts.map((shift) => ({
    ...shift,
    transactions: (shift.transactions || []).filter((tx) =>
      pageIds.has(String(tx.id ?? tx.order_id)),
    ),
  }));

  return {
    period: filters.period === 'custom' ? 'today' : filters.period,
    date_label: formatDateLabel(filters.start, filters.end),
    top_stats: topStats,
    shifts: pagedShifts,
    pagination,
  };
};
