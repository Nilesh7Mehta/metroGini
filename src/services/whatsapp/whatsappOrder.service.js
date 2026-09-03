import sql from "../../config/db.js";
import { assertValidMobile } from "./whatsappAuth.service.js";

const ACTIVE_STATUSES = [
  "booked",
  "out_for_pickup",
  "pickup_in_progress",
  "picked_up",
  "in_process",
  "order_finalized",
  "ready_for_delivery",
  "out_for_delivery",
];

const STAGE_LABELS = {
  booked: "Booking Confirmed",
  out_for_pickup: "Rider Out For Pickup",
  pickup_in_progress: "Pickup In Progress",
  picked_up: "Clothes Collected",
  in_process: "At Laundry",
  order_finalized: "Weight Confirmed — Payment Due",
  ready_for_delivery: "Ready For Delivery",
  out_for_delivery: "Out For Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const getActiveOrderByMobile = async ({ mobile }) => {
  const normalized = assertValidMobile(mobile);

  const { rows } = await sql.query(
    `
    SELECT o.id,
           o.order_code,
           o.status,
           o.clothes_count,
           o.pickup_date,
           o.delivery_date,
           o.actual_weight,
           o.final_total,
           o.remaining_amount,
           o.amount_paid,
           o.payment_status,
           o.assigned_rider_id
    FROM users u
    INNER JOIN orders o ON o.user_id = u.id
    WHERE u.mobile = $1
      AND o.status = ANY($2::text[])
    ORDER BY o.id DESC
    LIMIT 1
    `,
    [normalized, ACTIVE_STATUSES],
  );

  if (rows.length === 0) {
    return {
      success: true,
      message: "No active order",
      data: { has_active_order: false, mobile: normalized },
    };
  }

  const o = rows[0];
  return {
    success: true,
    message: "Active order found",
    data: {
      has_active_order: true,
      mobile: normalized,
      order_id: Number(o.id),
      order_code: o.order_code,
      status: o.status,
      stage_label: STAGE_LABELS[o.status] || o.status,
      clothes_count: o.clothes_count,
      pickup_date: o.pickup_date,
      delivery_date: o.delivery_date,
      actual_weight: o.actual_weight != null ? Number(o.actual_weight) : null,
      final_total: o.final_total != null ? Number(o.final_total) : null,
      remaining_amount:
        o.remaining_amount != null ? Number(o.remaining_amount) : null,
      amount_paid: o.amount_paid != null ? Number(o.amount_paid) : null,
      payment_status: o.payment_status,
    },
  };
};

export const getOrderRider = async ({ orderId }) => {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) {
    throw { status: 400, message: "order id must be a positive integer" };
  }

  const { rows } = await sql.query(
    `
    SELECT o.id AS order_id,
           o.order_code,
           o.status,
           o.assigned_rider_id,
           r.full_name AS rider_name,
           r.mobile_number AS rider_mobile
    FROM orders o
    LEFT JOIN riders r ON r.id = o.assigned_rider_id
    WHERE o.id = $1
    `,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Order not found" };
  }

  const o = rows[0];
  if (!o.assigned_rider_id) {
    return {
      success: true,
      message: "No rider assigned yet",
      data: {
        order_id: id,
        order_code: o.order_code,
        status: o.status,
        rider_name: null,
        mobile: null,
        track_url: null,
      },
    };
  }

  return {
    success: true,
    message: "Rider retrieved",
    data: {
      order_id: id,
      order_code: o.order_code,
      status: o.status,
      rider_name: o.rider_name || null,
      mobile: o.rider_mobile || null,
      track_url: null,
    },
  };
};

/**
 * Basic delay helper for WhatsApp — uses order dates/status.
 * Does not invent traffic ETA; flags likely delay when past pickup day.
 */
export const getDelayStatus = async ({ orderId }) => {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id < 1) {
    throw { status: 400, message: "order id must be a positive integer" };
  }

  const { rows } = await sql.query(
    `
    SELECT o.id,
           o.order_code,
           o.status,
           o.pickup_date,
           o.delivery_date,
           o.assigned_rider_id,
           r.full_name AS rider_name,
           r.mobile_number AS rider_mobile
    FROM orders o
    LEFT JOIN riders r ON r.id = o.assigned_rider_id
    WHERE o.id = $1
    `,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Order not found" };
  }

  const o = rows[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pickup =
    o.pickup_date != null ? new Date(o.pickup_date) : null;
  if (pickup) pickup.setHours(0, 0, 0, 0);

  const delivery =
    o.delivery_date != null ? new Date(o.delivery_date) : null;
  if (delivery) delivery.setHours(0, 0, 0, 0);

  let type = null;
  let is_delayed = false;

  if (
    ["booked", "out_for_pickup", "pickup_in_progress"].includes(o.status) &&
    pickup &&
    pickup < today
  ) {
    type = "pickup";
    is_delayed = true;
  } else if (
    ["ready_for_delivery", "out_for_delivery"].includes(o.status) &&
    delivery &&
    delivery < today
  ) {
    type = "delivery";
    is_delayed = true;
  }

  return {
    success: true,
    message: is_delayed ? "Order appears delayed" : "No delay detected",
    data: {
      order_id: id,
      order_code: o.order_code,
      status: o.status,
      is_delayed,
      type,
      reason: is_delayed ? "past_scheduled_date" : null,
      new_eta: null,
      rider: o.assigned_rider_id
        ? {
            name: o.rider_name || null,
            mobile: o.rider_mobile || null,
          }
        : null,
      track_url: null,
      note: is_delayed
        ? "No live ETA from rider tracking yet — escalate to agent if needed."
        : null,
    },
  };
};
