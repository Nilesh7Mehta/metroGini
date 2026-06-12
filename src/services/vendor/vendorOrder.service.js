import sql from '../../config/db.js';
import { buildOrderTimestamps, fetchOrderTimestamps, formatDateTime } from '../../utils/datetime.util.js';
import { createNotificationsBatch } from '../../utils/notificationHelper.js';
import { generateOTP } from '../../utils/otp.js';
import { getPickupShiftConfig } from '../common/pickupShiftSlots.service.js';

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

/** Vendor-facing status aligned with dashboard operational_distribution */
const getVendorOperationalStatus = (order) => {
  if (isClassificationPending(order)) return 'pending_classification';
  if (
    order.status === 'order_finalized' ||
    (order.status === 'in_process' && !isClassificationPending(order))
  ) {
    return 'in_processing';
  }
  if (['ready_for_delivery', 'out_for_delivery'].includes(order.status)) {
    return 'ready_for_dispatch';
  }
  if (order.status === 'delivered') return 'delivered';
  if (order.status === 'picked_up') return 'awaiting_handover';
  return order.status;
};

// Returns { start, end } date strings for the given filter
const formatDate = (date) =>
  date.toLocaleDateString('en-CA'); // YYYY-MM-DD

const formatGeneratedAt = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
        ? `${Number(order.actual_weight)} kg/`
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
      estimated_kg: washOrders.reduce(
        (sum, o) =>
          sum +
          getEstimatedKg(o.estimated_weight_min, o.estimated_weight_max),
        0,
      ),
      final_kg: washOrders.reduce(
        (sum, o) => sum + Number(o.actual_weight || 0),
        0,
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
  ready_for_dispatch: orders.filter((o) =>
    ['ready_for_delivery', 'out_for_delivery'].includes(o.status),
  ).length,
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

      COALESCE(SUM(final_total) FILTER (
        WHERE status IN (
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
          AND final_total IS NOT NULL
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
        WHERE status IN ('ready_for_delivery', 'out_for_delivery')
      ) AS ready_for_dispatch

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
    final_total: order.final_total ? parseFloat(order.final_total) : null,
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

export const confirmWeightService = async (vendor_id, order_id, actual_weight) => {
  const orderCheck = await sql.query(
    `SELECT o.id, o.status, o.base_price_per_kg, o.extra_price_per_kg, o.flat_fee,
            o.peak_extra_charge, o.applied_coupon_id,
            o.estimated_weight_min, o.estimated_weight_max, o.estimated_total,
            c.discount_type, c.discount_value, c.minimum_amount_value
     FROM orders o
     LEFT JOIN coupons c ON o.applied_coupon_id = c.id
     WHERE o.id = $1 AND o.vendor_id = $2`,
    [order_id, vendor_id]
  );

  if (orderCheck.rows.length === 0) {
    throw { status: 404, message: 'Order not found or does not belong to this vendor' };
  }

  if (orderCheck.rows[0].status !== 'in_process') {
    throw { status: 400, message: 'Weight can only be confirmed when order status is in_process' };
  }

  const order = orderCheck.rows[0];
  const weight_min = Number(order.estimated_weight_min);
  const weight_max = Number(order.estimated_weight_max);
  const within_range = actual_weight <= weight_max;

  let final_total;
  let pricing_note;

  if (within_range) {
    // Actual weight is within estimated range — keep the estimated_total as-is
    final_total  = Number(order.estimated_total);
    pricing_note = 'within_estimate';
  } else {
    // Actual weight exceeds max estimate
    // Only charge extra for the weight beyond estimated_weight_max
    const extra_kg    = actual_weight - weight_max;
    const rate_per_kg = Number(order.base_price_per_kg) + Number(order.extra_price_per_kg);
    const extra_cost  = parseFloat((extra_kg * rate_per_kg).toFixed(2));

    final_total  = parseFloat((Number(order.estimated_total) + extra_cost).toFixed(2));
    pricing_note = 'exceeded_estimate';
  }

  await sql.query(
    `UPDATE orders
     SET actual_weight = $1, final_total = $2, status = 'in_process', updated_at = NOW()
     WHERE id = $3`,
    [actual_weight, final_total, order_id]
  );

  return {
    order_id:      parseInt(order_id),
    actual_weight: parseFloat(actual_weight),
    estimated_range: { min: weight_min, max: weight_max },
    pricing_note,
    final_total:   parseFloat(final_total.toFixed(2)),
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
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.user_id FROM orders o
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

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'ready_for_delivery',
    delivery_otp, // remove in Production
    timestamps,
    ready_for_delivery_at: timestamps.ready_for_delivery_at,
  };
};
