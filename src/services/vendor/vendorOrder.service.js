import sql from '../../config/db.js';
import { createNotificationsBatch } from '../../utils/notificationHelper.js';

// Returns { start, end } date strings for the given filter
const formatDate = (date) =>
  date.toLocaleDateString('en-CA'); // YYYY-MM-DD

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
          'ready_for_delivery',
          'out_for_delivery',
          'delivered'
        )
      ) AS orders_received,

      COUNT(*) FILTER (
        WHERE status = 'delivered'
      ) AS orders_delivered,

      COALESCE(SUM(actual_weight) FILTER (
        WHERE status = 'delivered'
      ), 0) AS load_processed,

      COALESCE(SUM(final_total) FILTER (
        WHERE status = 'delivered'
      ), 0) AS revenue

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at BETWEEN $2 AND $3
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
      s.name AS service_name,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.clothes_count,
      st.name AS service_type_name
    FROM orders o
    JOIN services s ON o.service_id = s.id
    LEFT JOIN service_types st ON o.service_type_id = st.id
    WHERE o.vendor_id = $1
      AND o.vendor_received_at BETWEEN $2 AND $3
      AND o.status NOT IN ('draft', 'cancelled')
    `,
    [vendor_id, start, end]
  );

  const totalOrders = batchResult.rows.length;

  const serviceMap = {};

  for (const row of batchResult.rows) {
    const key = row.service_name || 'Unknown';

    if (!serviceMap[key]) {
      serviceMap[key] = {
        service_name: key,
        orders: [],
      };
    }

    serviceMap[key].orders.push(row);
  }

  const services = Object.values(serviceMap).map((svc) => {
  let min = 0, max = 0, items = 0;

  for (const o of svc.orders) {
    min += Number(o.estimated_weight_min || 0);
    max += Number(o.estimated_weight_max || 0);
    items += Number(o.clothes_count || 0);
  }

  return {
    service_name: svc.service_name,
    service_type: svc.service_type_name, // 👈 important

    estimated_weight: {
      min,
      max,
      unit: 'kg',
    },

    total_items: items,
    total_orders: svc.orders.length,
  };
});

  // =========================
  // 3. OPERATIONAL DISTRIBUTION
  // =========================
  const opsResult = await sql.query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE status = 'picked_up'
      ) AS pending_classification,

      COUNT(*) FILTER (
        WHERE status = 'in_process'
      ) AS in_processing,

      COUNT(*) FILTER (
        WHERE status = 'ready_for_delivery'
      ) AS ready_for_dispatch

    FROM orders
    WHERE vendor_id = $1
      AND vendor_received_at BETWEEN $2 AND $3
    `,
    [vendor_id, start, end]
  );

  const ops = opsResult.rows[0];

  const batchLabel =
    filter === 'this_week'
      ? 'weeks_batch_overview'
      : filter === 'this_month'
      ? 'months_batch_overview'
      : 'todays_batch_overview';

  return {
    filter,
    date_range: { start, end },

    performance_overview: {
      orders_received: parseInt(perf.orders_received),
      orders_delivered: parseInt(perf.orders_delivered),
      load_processed: {
        value: parseFloat(perf.load_processed),
        unit: 'kg/pieces',
      },
      revenue: parseFloat(perf.revenue),
    },

    [batchLabel]: {
      total_orders: totalOrders,
      services,
    },

    operational_distribution: {
      pending_classification: parseInt(ops.pending_classification),
      in_processing: parseInt(ops.in_processing),
      ready_for_dispatch: parseInt(ops.ready_for_dispatch),
    },
  };
};

export const getOrderDetailsService = async (vendor_id, order_id) => {
  const result = await sql.query(
    `
    SELECT 
      o.id AS order_id,
      u.full_name AS customer_name,
      u.profile_image AS customer_image,
      ua.complete_address AS address,
      o.estimated_weight_min,
      o.estimated_weight_max,
      o.clothes_count AS clothes_count,
      o.actual_clothes_count,
      o.actual_weight,
      s.name AS service_name,
      st.name AS service_type_name,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
      pickup_slot.start_time AS pickup_slot_start,
      pickup_slot.end_time AS pickup_slot_end,
      TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
      delivery_slot.start_time AS delivery_slot_start,
      delivery_slot.end_time AS delivery_slot_end,
      o.status,
      o.estimated_total,
      o.final_total
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

  // Fetch order_items if clothes have been confirmed
  const itemsResult = await sql.query(
    `SELECT category, quantity FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
    [order_id]
  );

  return {
    order_id: order.order_id,
    customer: {
      name: order.customer_name,
      image: order.customer_image,
    },
    address: order.address,
    estimated_weight: {
      min: parseFloat(order.estimated_weight_min || 0),
      max: parseFloat(order.estimated_weight_max || 0),
      unit: 'kg',
    },
    clothes_count: parseInt(order.clothes_count || 0),
    actual_clothes_count: order.actual_clothes_count ? parseInt(order.actual_clothes_count) : null,
    actual_weight: order.actual_weight ? parseFloat(order.actual_weight) : null,
    order_items: itemsResult.rows,
    service: {
      name: order.service_name,
      type: order.service_type_name,
    },
    pickup: {
      date: order.pickup_date,
      slot: {
        start: order.pickup_slot_start,
        end: order.pickup_slot_end,
      },
    },
    delivery: {
      date: order.delivery_date,
      slot: {
        start: order.delivery_slot_start,
        end: order.delivery_slot_end,
      },
    },
    status: order.status,
    estimated_total: parseFloat(order.estimated_total || 0),
    final_total: parseFloat(order.final_total || 0),
  };
};

export const confirmClothesService = async (vendor_id, order_id, items) => {
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

  await sql.query('BEGIN');

  try {
    // Delete existing items (supports re-submission)
    await sql.query('DELETE FROM order_items WHERE order_id = $1', [order_id]);

    let total_clothes_count = 0;

    for (const item of items) {
      if (!item.category || item.quantity === undefined || item.quantity < 0) {
        throw { status: 400, message: 'Each item must have a category and valid quantity' };
      }

      await sql.query(
        `INSERT INTO order_items (order_id, category, quantity) VALUES ($1, $2, $3)`,
        [order_id, item.category, item.quantity]
      );

      total_clothes_count += parseInt(item.quantity);
    }

    // Update actual_clothes_count on orders
    await sql.query(
      `UPDATE orders SET actual_clothes_count = $1, updated_at = NOW() WHERE id = $2`,
      [total_clothes_count, order_id]
    );

    await sql.query('COMMIT');

    return {
      order_id: parseInt(order_id),
      actual_clothes_count: total_clothes_count,
      items: items.map(item => ({ category: item.category, quantity: parseInt(item.quantity) })),
    };
  } catch (error) {
    await sql.query('ROLLBACK');
    throw error;
  }
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
    `UPDATE orders SET status = 'order_finalized', updated_at = NOW() WHERE id = $1`,
    [order_id]
  );

  // Notify user about final amount
  await createNotificationsBatch([{
    user_id: order.user_id,
    title: 'Your laundry has been weighed',
    message: 'The exact weight has been calculated. The final amount details are available in the app.',
    reference_type: 'order',
    reference_id: order_id,
  }]);

  return {
    order_id: parseInt(order_id),
    status: 'order_finalized',
    final_total: parseFloat(order.final_total),
  };
};
