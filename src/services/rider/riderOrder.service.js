import sql from "../../config/db.js";
import { checkRiderReady } from "../../models/riders/rider.model.js";
import { buildOrderTimestamps, fetchOrderTimestamps } from "../../utils/datetime.util.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";
import { sendUserEmailSafe, sendPickupOtpEmail } from "../common/email.service.js";
import { sendOtpSmsIfEnabled, sendSmsToUserSafe } from "../common/sms.service.js";
import { isSmsEnabled } from "../../config/sms.js";
import { createRemainingPaymentQr } from "./riderPaymentQr.service.js";
import {
  generateOTP,
  otpMatches,
  getCooldownRemainingSeconds,
} from "../../utils/otp.js";
import { SMS_TEMPLATE_KEYS } from "../../utils/smsTemplates.js";
import {
  deliveryOtpTemplate,
  formatOrderDisplayId,
  pickupOtpTemplate,
  ratingRequestTemplate,
} from "../../utils/userNotificationTemplates.js";

const attachOrderTimestamps = (row) => ({
  ...row,
  special_instructions: row.pickup_special_instruction ?? null,
  delivery_instructions: row.delivery_special_instruction ?? null,
  timestamps: buildOrderTimestamps(row),
});

/** Optional shift name. Matches time_slots.shift_name when provided. */
const shiftNameFilter = (shift) => {
  const value = shift != null ? String(shift).trim() : "";
  if (!value) return { sql: "", params: [] };
  return {
    sql: `AND LOWER(TRIM(ts.shift_name)) = LOWER(TRIM($2))`,
    params: [value],
  };
};

export const fetchTodayOrders = async (rider_id, shift) => {
  // const ready = await checkRiderReady(rider_id);
  // if (!ready)
  //   throw {
  //     status: 400,
  //     message: "Rider must select shift and go online first",
  //   };

  const shiftFilter = shiftNameFilter(shift);
  const { rows } = await sql.query(
    `SELECT
        o.id, TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date, o.status, o.vendor_id,
        o.pickup_special_instruction, o.delivery_special_instruction,
        o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
        o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
        o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
        o.created_at, o.updated_at, o.otp_generated_at,
        ts.start_time, ts.end_time,
        u.full_name AS customer_name,
        u.id AS customer_id,
        u.mobile AS customer_number,
        COALESCE(o.address_snapshot->>'complete_address', a.complete_address) AS complete_address,
        COALESCE(o.address_snapshot->>'floor', a.floor) AS floor,
        COALESCE(o.address_snapshot->>'landmark', a.landmark) AS landmark,
        COALESCE(o.address_snapshot->>'address_type', a.address_type) AS address_type,
        COALESCE(o.address_snapshot->>'receiver_name', a.receiver_name) AS receiver_name,
        COALESCE(o.address_snapshot->>'contact_number', a.contact_number) AS contact_number,
        COALESCE(o.address_snapshot->>'pincode', a.pincode) AS pincode,
        COALESCE(
          NULLIF(o.address_snapshot->>'latitude', '')::double precision,
          a.latitude
        ) AS latitude,
        COALESCE(
          NULLIF(o.address_snapshot->>'longitude', '')::double precision,
          a.longitude
        ) AS longitude,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS vendor_address,
        v.latitude AS vendor_latitude,
        v.longitude AS vendor_longitude
     FROM orders o
     JOIN time_slots ts ON ts.id = o.pickup_slot_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.assigned_rider_id = $1
       AND o.pickup_date = CURRENT_DATE
       AND o.status IN ('out_for_pickup', 'pickup_in_progress','in_process' , 'picked_up')
       ${shiftFilter.sql}
     ORDER BY o.id DESC`,
    [rider_id, ...shiftFilter.params],
  );
  return rows.map(attachOrderTimestamps);
};

export const fetchTodayDeliveryOrders = async (rider_id, shift) => {
  // const ready = await checkRiderReady(rider_id);
  // if (!ready)
  //   throw {
  //     status: 400,
  //     message: "Rider must select shift and go online first",
  //   };
  const shiftFilter = shiftNameFilter(shift);
  const { rows } = await sql.query(
    `SELECT
        o.id,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
        o.status,
        o.vendor_id,
        o.payment_status,
        o.pickup_special_instruction,
        o.delivery_special_instruction,
        o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
        o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
        o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
        o.created_at, o.updated_at, o.otp_generated_at,
        ts.start_time,
        ts.end_time,
        u.full_name AS customer_name,
        u.id AS customer_id,
        u.mobile AS customer_number,
        COALESCE(o.address_snapshot->>'complete_address', a.complete_address) AS complete_address,
        COALESCE(o.address_snapshot->>'floor', a.floor) AS floor,
        COALESCE(o.address_snapshot->>'landmark', a.landmark) AS landmark,
        COALESCE(o.address_snapshot->>'address_type', a.address_type) AS address_type,
        COALESCE(o.address_snapshot->>'receiver_name', a.receiver_name) AS receiver_name,
        COALESCE(o.address_snapshot->>'contact_number', a.contact_number) AS contact_number,
        COALESCE(o.address_snapshot->>'pincode', a.pincode) AS pincode,
        COALESCE(
          NULLIF(o.address_snapshot->>'latitude', '')::double precision,
          a.latitude
        ) AS latitude,
        COALESCE(
          NULLIF(o.address_snapshot->>'longitude', '')::double precision,
          a.longitude
        ) AS longitude,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS shop_address,
        v.shop_address AS vendor_address,
        v.latitude AS vendor_latitude,
        v.longitude AS vendor_longitude
     FROM orders o
     JOIN time_slots ts ON ts.id = o.delivery_slot_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.assigned_rider_id = $1
       AND o.delivery_date = CURRENT_DATE
      AND o.status IN ('ready_for_delivery', 'out_for_delivery', 'delivered')
      ${shiftFilter.sql}
     ORDER BY o.id DESC`,
    [rider_id, ...shiftFilter.params],
  );
  return rows.map(attachOrderTimestamps);
};

export const fetchRiderOrderDetail = async (rider_id, order_id) => {
  const id = Number(order_id);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid order id" };
  }

  const { rows } = await sql.query(
    `SELECT
        o.id,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
        o.status,
        o.vendor_id,
        o.payment_status,
        o.pickup_special_instruction,
        o.delivery_special_instruction,
        o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
        o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
        o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
        o.created_at, o.updated_at, o.otp_generated_at,
        ts.start_time,
        ts.end_time,
        u.full_name AS customer_name,
        u.id AS customer_id,
        u.mobile AS customer_number,
        COALESCE(o.address_snapshot->>'complete_address', a.complete_address) AS complete_address,
        COALESCE(o.address_snapshot->>'floor', a.floor) AS floor,
        COALESCE(o.address_snapshot->>'landmark', a.landmark) AS landmark,
        COALESCE(o.address_snapshot->>'address_type', a.address_type) AS address_type,
        COALESCE(o.address_snapshot->>'receiver_name', a.receiver_name) AS receiver_name,
        COALESCE(o.address_snapshot->>'contact_number', a.contact_number) AS contact_number,
        COALESCE(o.address_snapshot->>'pincode', a.pincode) AS pincode,
        COALESCE(
          NULLIF(o.address_snapshot->>'latitude', '')::double precision,
          a.latitude
        ) AS latitude,
        COALESCE(
          NULLIF(o.address_snapshot->>'longitude', '')::double precision,
          a.longitude
        ) AS longitude,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS shop_address,
        v.shop_address AS vendor_address,
        v.latitude AS vendor_latitude,
        v.longitude AS vendor_longitude
     FROM orders o
     LEFT JOIN time_slots ts ON ts.id = o.delivery_slot_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.id = $1
       AND o.assigned_rider_id = $2`,
    [id, rider_id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Order not found" };
  }

  return attachOrderTimestamps(rows[0]);
};

export const fetchDashboardCount = async (rider_id, shift) => {
  const { rows } = await sql.query(
    `SELECT
    COUNT(*) FILTER (
        WHERE o.status IN ('out_for_pickup','pickup_in_progress')
          AND o.pickup_date = CURRENT_DATE
          AND LOWER(TRIM(pickup_ts.shift_name)) = LOWER(TRIM($2))
    ) AS pending_pickup,

    COUNT(*) FILTER (
        WHERE o.status = 'in_process'
          AND o.pickup_date = CURRENT_DATE
          AND LOWER(TRIM(pickup_ts.shift_name)) = LOWER(TRIM($2))
    ) AS completed_pickup,

    COUNT(*) FILTER (
        WHERE o.status IN ('ready_for_delivery', 'out_for_delivery')
          AND o.delivery_date = CURRENT_DATE
          AND LOWER(TRIM(delivery_ts.shift_name)) = LOWER(TRIM($2))
    ) AS pending_drop,

    COUNT(*) FILTER (
        WHERE o.status = 'delivered'
          AND o.delivery_date = CURRENT_DATE
          AND LOWER(TRIM(delivery_ts.shift_name)) = LOWER(TRIM($2))
    ) AS completed_drop

    FROM orders o
    LEFT JOIN time_slots pickup_ts ON pickup_ts.id = o.pickup_slot_id
    LEFT JOIN time_slots delivery_ts ON delivery_ts.id = o.delivery_slot_id
    WHERE o.assigned_rider_id = $1`,
    [rider_id, String(shift || "").trim()],
  );
  return rows[0];
};

/** Last 7 days, excluding today. No shift filter. */
const MISSED_PICKUP_STATUSES = [
  "out_for_pickup",
  "pickup_in_progress",
  "picked_up",
  "in_process",
  "at_vendor",
];
const MISSED_DROP_STATUSES = ["ready_for_delivery", "out_for_delivery"];

export const fetchMissingOrderCounts = async (rider_id) => {
  const { rows } = await sql.query(
    `SELECT
        COUNT(*) FILTER (
          WHERE o.pickup_date >= (CURRENT_DATE - INTERVAL '7 days')::date
            AND o.pickup_date < CURRENT_DATE
            AND o.status = ANY($2::text[])
        ) AS missing_pickup,
        COUNT(*) FILTER (
          WHERE o.delivery_date >= (CURRENT_DATE - INTERVAL '7 days')::date
            AND o.delivery_date < CURRENT_DATE
            AND o.status = ANY($3::text[])
        ) AS missing_drop
     FROM orders o
     WHERE o.assigned_rider_id = $1`,
    [rider_id, MISSED_PICKUP_STATUSES, MISSED_DROP_STATUSES],
  );

  return {
    missing_pickup: Number(rows[0]?.missing_pickup || 0),
    missing_drop: Number(rows[0]?.missing_drop || 0),
  };
};

export const startDelivery = async (rider_id, order_id) => {
  const { rows: activeOrders } = await sql.query(
    `SELECT id FROM orders WHERE assigned_rider_id = $1 AND status = 'pickup_in_progress'`,
    [rider_id],
  );
  if (activeOrders.length > 0)
    throw {
      status: 400,
      message: "Finish current delivery before starting another",
    };

  const { rows } = await sql.query(
    `SELECT id, status, assigned_rider_id FROM orders WHERE id = $1`,
    [order_id],
  );
  if (rows.length === 0) throw { status: 404, message: "Order not found" };

  const order = rows[0];
  if (order.assigned_rider_id !== rider_id)
    throw { status: 403, message: "You are not assigned to this order" };
  if (order.status !== "out_for_pickup")
    throw { status: 400, message: "Order cannot be started" };

  await sql.query(
    `UPDATE orders SET status = 'pickup_in_progress', pickup_started_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Generate / refresh pickup OTP and notify user (template 6)
  const { rows: orderRows } = await sql.query(
    `SELECT o.user_id, o.order_code, o.pickup_otp, u.full_name, u.mobile
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [order_id],
  );
  if (orderRows.length > 0) {
    const otp = orderRows[0].pickup_otp || generateOTP();
    await sql.query(
      `UPDATE orders SET pickup_otp = $1, otp_generated_at = NOW() WHERE id = $2`,
      [otp, order_id],
    );

    const pickupOtp = pickupOtpTemplate({ otp });
    await createNotificationsBatch([
      {
        identity_id: orderRows[0].user_id,
        role: "user",
        title: pickupOtp.title,
        message: pickupOtp.message,
        reference_type: "order",
        reference_id: order_id,
        data: pickupOtp.data,
      },
    ]);

    sendUserEmailSafe(orderRows[0].user_id, sendPickupOtpEmail, {
      orderId: order_id,
      orderCode: orderRows[0].order_code,
      otp,
    });

    sendSmsToUserSafe(
      orderRows[0].user_id,
      SMS_TEMPLATE_KEYS.OTP_PICKUP,
      { otp },
      { reference_type: "order", reference_id: order_id },
    );

    const {
      sendOrderPickupUpdateSafe,
      ORDER_PICKUP_UPDATE_TITLE,
    } = await import("../whatsapp/gallaboxWhatsapp.service.js");

    // Fallback if morning cron missed (no rider assigned yet at that time)
    const alreadySent = await sql.query(
      `SELECT 1 FROM notifications
       WHERE identity_id = $1 AND role = 'user'
         AND reference_type = 'order' AND reference_id = $2
         AND title = $3
       LIMIT 1`,
      [orderRows[0].user_id, order_id, ORDER_PICKUP_UPDATE_TITLE],
    );
    if (alreadySent.rows.length === 0) {
      await createNotificationsBatch([
        {
          identity_id: orderRows[0].user_id,
          role: "user",
          title: ORDER_PICKUP_UPDATE_TITLE,
          message: `Your rider has been assigned. Share OTP ${otp} at pickup.`,
          reference_type: "order",
          reference_id: order_id,
        },
      ]);
      sendOrderPickupUpdateSafe({
        mobile: orderRows[0].mobile,
        name: orderRows[0].full_name,
        otp,
      });
    }
  }

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'pickup_in_progress',
    timestamps,
    pickup_started_at: timestamps.pickup_started_at,
  };
};

export const verifyOtp = async (rider_id, order_id, otp) => {
  const { rows } = await sql.query(
    `SELECT id, pickup_otp, assigned_rider_id, status FROM orders WHERE id = $1`,
    [order_id],
  );
  if (rows.length === 0) throw { status: 404, message: "Order not found" };

  const order = rows[0];
  if (order.assigned_rider_id !== rider_id)
    throw { status: 403, message: "You are not assigned to this order" };
  // if (order.status !== "active")
  //   throw { status: 400, message: "Order is not in delivery stage" };
  if (!otpMatches(order.pickup_otp, otp))
    throw { status: 400, message: "Invalid OTP" };

  await sql.query(
    `UPDATE orders SET status = 'picked_up', otp_verified = 'true', pickup_completed_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Notify user clothes have been picked up
  const { rows: pickedRows } = await sql.query(
    `SELECT o.user_id, u.full_name, u.mobile
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [order_id],
  );
  if (pickedRows.length > 0) {
    await createNotificationsBatch([{
      identity_id: pickedRows[0].user_id,
      role: 'user',
      title: 'Clothes Picked Up',
      message: `Your clothes for order ${formatOrderDisplayId(order_id)} have been picked up and are on the way to our Wash by Kilo facility.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    const { sendPickupCompletedSafe } = await import(
      "../whatsapp/gallaboxWhatsapp.service.js"
    );
    sendPickupCompletedSafe({
      mobile: pickedRows[0].mobile,
      name: pickedRows[0].full_name,
    });
  }

  try {
    const { emitWhatsappOrderEventSafe } = await import(
      "../whatsapp/whatsappEvents.service.js"
    );
    emitWhatsappOrderEventSafe("pickup_completed", order_id);
  } catch (_) {
    /* ignore */
  }

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'picked_up',
    timestamps,
    pickup_completed_at: timestamps.pickup_completed_at,
  };
};

export const resendOtp = async (rider_id, order_id) => {
  if (!order_id) throw { status: 400, message: "order_id is required" };

  const { rows } = await sql.query(
    `SELECT o.id, o.user_id, o.order_code, o.assigned_rider_id,
            o.otp_verified, o.otp_generated_at, u.mobile
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [order_id],
  );
  if (rows.length === 0) throw { status: 404, message: "Order not found" };

  const order = rows[0];
  if (order.assigned_rider_id !== rider_id)
    throw { status: 403, message: "You are not assigned to this order" };
  if (order.otp_verified)
    throw { status: 400, message: "Pickup OTP already verified" };

  const remaining = getCooldownRemainingSeconds(order.otp_generated_at);
  if (remaining > 0) {
    throw {
      status: 429,
      message: `Please wait ${remaining} seconds before requesting another OTP`,
    };
  }

  const otp = generateOTP();

  try {
    await sendOtpSmsIfEnabled(
      SMS_TEMPLATE_KEYS.OTP_PICKUP,
      order.mobile,
      { otp },
      { reference_type: "order", reference_id: order_id },
    );
  } catch (error) {
    throw {
      status: error.status || 502,
      message: "Unable to send OTP. Please try again.",
    };
  }

  await sql.query(
    `UPDATE orders SET pickup_otp = $1, otp_generated_at = NOW() WHERE id = $2`,
    [otp, order_id],
  );

  const pickupOtp = pickupOtpTemplate({ otp });
  await createNotificationsBatch([
    {
      identity_id: order.user_id,
      role: 'user',
      title: pickupOtp.title,
      message: pickupOtp.message,
      reference_type: "order",
      reference_id: order_id,
      data: pickupOtp.data,
    },
  ]);

  sendUserEmailSafe(order.user_id, sendPickupOtpEmail, {
    orderId: order.id,
    orderCode: order.order_code,
    otp,
  });

  return isSmsEnabled() ? {} : { otp };
};

export const handoverToVendorService = async (rider_id, order_id, vendor_id) => {

  const { rows } = await sql.query(
    `SELECT id, status, assigned_rider_id, vendor_id 
     FROM orders 
     WHERE id = $1`,
    [order_id]
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Order not found" };
  }

  const order = rows[0];

  // ✅ Rider validation
  if (order.assigned_rider_id !== rider_id) {
    throw { status: 403, message: "You are not assigned to this order" };
  }

  // ✅ Vendor validation
  if (order.vendor_id !== vendor_id) {
    throw { status: 400, message: "Invalid vendor for this order" };
  }

  // ✅ Status validation
  if (order.status !== "picked_up") {
    throw { status: 400, message: "Order must be in picked_up state" };
  }

  // ✅ Update
  await sql.query(
    `UPDATE orders
     SET status = 'in_process',
         vendor_received_at = NOW()
     WHERE id = $1`,
    [order_id],
  );

  // Notify vendor that order has been received
  await createNotificationsBatch([{
    identity_id: order.vendor_id,
    role: 'vendor',
    title: 'New Order Received',
    message: `Order #${order_id} has been handed over by the rider and is now in your queue for processing.`,
    reference_type: 'order',
    reference_id: order_id,
  }]);

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'in_process',
    timestamps,
    vendor_received_at: timestamps.vendor_received_at,
  };
};

const HISTORY_PERIOD_SQL = {
  today: `(o.pickup_date = CURRENT_DATE OR o.delivery_date = CURRENT_DATE)`,
  this_week: `(
    (o.pickup_date >= date_trunc('week', CURRENT_DATE)::date
      AND o.pickup_date < date_trunc('week', CURRENT_DATE)::date + 7)
    OR
    (o.delivery_date >= date_trunc('week', CURRENT_DATE)::date
      AND o.delivery_date < date_trunc('week', CURRENT_DATE)::date + 7)
  )`,
  this_month: `(
    (o.pickup_date >= date_trunc('month', CURRENT_DATE)::date
      AND o.pickup_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date)
    OR
    (o.delivery_date >= date_trunc('month', CURRENT_DATE)::date
      AND o.delivery_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date)
  )`,
};

const resolveHistoryPeriod = (query = {}) => {
  const raw = String(query.period ?? query.time_filter ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!raw || raw === "all") return null;

  const aliases = {
    today: "today",
    this_week: "this_week",
    week: "this_week",
    this_month: "this_month",
    month: "this_month",
  };
  const period = aliases[raw];
  if (!period) {
    throw {
      status: 400,
      message: "period must be today, this_week, or this_month",
    };
  }
  return period;
};

const parseHistoryPage = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  return { page, limit, offset: (page - 1) * limit };
};

export const fetchOrderHistory = async (rider_id, query = {}) => {
  const { order_type, status } = query;
  const { page, limit, offset } = parseHistoryPage(query);
  const period = resolveHistoryPeriod(query);

  const conditions = [`o.assigned_rider_id = $1`];
  const values = [rider_id];
  let index = 2;

  if (order_type === "regular") {
    conditions.push(`st.name = $${index++}`);
    values.push("Regular Service");
  }
  if (order_type === "express") {
    conditions.push(`st.name = $${index++}`);
    values.push("Express Service");
  }

  if (status != null && String(status).trim() !== "") {
    conditions.push(`o.status = $${index++}`);
    values.push(String(status).trim());
  }

  if (period) conditions.push(HISTORY_PERIOD_SQL[period]);

  const where = conditions.join(" AND ");
  const joins = `
     FROM orders o
     LEFT JOIN time_slots ts ON ts.id = o.pickup_slot_id
     INNER JOIN users u ON u.id = o.user_id
     LEFT JOIN service_types st ON st.id = o.service_type_id
     LEFT JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id`;

  const { rows: countRows } = await sql.query(
    `SELECT COUNT(*) ${joins} WHERE ${where}`,
    values,
  );
  const total = parseInt(countRows[0].count, 10);

  const { rows } = await sql.query(
    `SELECT
        o.id, TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date, o.status, o.vendor_id,
        o.pickup_special_instruction, o.delivery_special_instruction,
        o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
        o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
        o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
        o.created_at, o.updated_at, o.otp_generated_at,
        ts.start_time, ts.end_time,
        u.full_name AS customer_name,
        u.id AS customer_id,
        u.mobile AS customer_number,
        COALESCE(o.address_snapshot->>'complete_address', a.complete_address) AS complete_address,
        COALESCE(o.address_snapshot->>'floor', a.floor) AS floor,
        COALESCE(o.address_snapshot->>'landmark', a.landmark) AS landmark,
        COALESCE(o.address_snapshot->>'address_type', a.address_type) AS address_type,
        COALESCE(o.address_snapshot->>'receiver_name', a.receiver_name) AS receiver_name,
        COALESCE(o.address_snapshot->>'contact_number', a.contact_number) AS contact_number,
        COALESCE(o.address_snapshot->>'pincode', a.pincode) AS pincode,
        COALESCE(
          NULLIF(o.address_snapshot->>'latitude', '')::double precision,
          a.latitude
        ) AS latitude,
        COALESCE(
          NULLIF(o.address_snapshot->>'longitude', '')::double precision,
          a.longitude
        ) AS longitude,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS vendor_address,
        v.latitude AS vendor_latitude,
        v.longitude AS vendor_longitude
     ${joins}
     WHERE ${where}
     ORDER BY o.id DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    [...values, limit, offset],
  );

  return {
    total,
    page,
    limit,
    has_more: page * limit < total,
    data: rows.map(attachOrderTimestamps),
  };
};

const MISSED_PERIOD_INTERVAL = {
  "7days": "7 days",
  month: "1 month",
};

const resolveMissedPeriod = (query = {}) => {
  const raw = String(query.period ?? "7days")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (["7days", "7_days", "last_7_days", "week"].includes(raw)) return "7days";
  if (["month", "1month", "1_month", "30days"].includes(raw)) return "month";
  throw { status: 400, message: "period must be 7days or month" };
};

const toMissedOrder = (row, issueType) => {
  const isDrop = issueType === "missed_drop";
  return attachOrderTimestamps({
    id: row.id,
    pickup_date: row.pickup_date,
    delivery_date: row.delivery_date,
    status: row.status,
    vendor_id: row.vendor_id,
    payment_status: row.payment_status,
    pickup_special_instruction: row.pickup_special_instruction,
    delivery_special_instruction: row.delivery_special_instruction,
    booked_at: row.booked_at,
    out_for_pickup_at: row.out_for_pickup_at,
    pickup_started_at: row.pickup_started_at,
    pickup_completed_at: row.pickup_completed_at,
    vendor_received_at: row.vendor_received_at,
    order_finalized_at: row.order_finalized_at,
    ready_for_delivery_at: row.ready_for_delivery_at,
    out_for_delivery_at: row.out_for_delivery_at,
    delivery_completed_at: row.delivery_completed_at,
    cancelled_at: row.cancelled_at,
    payment_completed_at: row.payment_completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    otp_generated_at: row.otp_generated_at,
    start_time: isDrop ? row.delivery_start_time : row.pickup_start_time,
    end_time: isDrop ? row.delivery_end_time : row.pickup_end_time,
    customer_name: row.customer_name,
    customer_id: row.customer_id,
    customer_number: row.customer_number,
    complete_address: row.complete_address,
    floor: row.floor,
    landmark: row.landmark,
    address_type: row.address_type,
    receiver_name: row.receiver_name,
    contact_number: row.contact_number,
    pincode: row.pincode,
    latitude: row.latitude,
    longitude: row.longitude,
    vendor_name: row.vendor_name,
    vendor_address: row.vendor_address,
    vendor_latitude: row.vendor_latitude,
    vendor_longitude: row.vendor_longitude,
    issue_type: issueType,
  });
};

const fetchMissedOrders = async (rider_id, query = {}, issueType) => {
  const period = resolveMissedPeriod(query);
  const { page, limit, offset } = parseHistoryPage(query);
  const interval = MISSED_PERIOD_INTERVAL[period];
  const isDrop = issueType === "missed_drop";
  const dateColumn = isDrop ? "o.delivery_date" : "o.pickup_date";
  const statuses = isDrop ? MISSED_DROP_STATUSES : MISSED_PICKUP_STATUSES;

  const { rows } = await sql.query(
    `SELECT
        o.id,
        TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
        o.status,
        o.vendor_id,
        o.payment_status,
        o.pickup_special_instruction,
        o.delivery_special_instruction,
        o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
        o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
        o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
        o.created_at, o.updated_at, o.otp_generated_at,
        pts.start_time AS pickup_start_time,
        pts.end_time AS pickup_end_time,
        dts.start_time AS delivery_start_time,
        dts.end_time AS delivery_end_time,
        u.full_name AS customer_name,
        u.id AS customer_id,
        u.mobile AS customer_number,
        COALESCE(o.address_snapshot->>'complete_address', a.complete_address) AS complete_address,
        COALESCE(o.address_snapshot->>'floor', a.floor) AS floor,
        COALESCE(o.address_snapshot->>'landmark', a.landmark) AS landmark,
        COALESCE(o.address_snapshot->>'address_type', a.address_type) AS address_type,
        COALESCE(o.address_snapshot->>'receiver_name', a.receiver_name) AS receiver_name,
        COALESCE(o.address_snapshot->>'contact_number', a.contact_number) AS contact_number,
        COALESCE(o.address_snapshot->>'pincode', a.pincode) AS pincode,
        COALESCE(
          NULLIF(o.address_snapshot->>'latitude', '')::double precision,
          a.latitude
        ) AS latitude,
        COALESCE(
          NULLIF(o.address_snapshot->>'longitude', '')::double precision,
          a.longitude
        ) AS longitude,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS vendor_address,
        v.latitude AS vendor_latitude,
        v.longitude AS vendor_longitude,
        TO_CHAR((CURRENT_DATE - INTERVAL '${interval}')::date, 'YYYY-MM-DD') AS date_from,
        TO_CHAR((CURRENT_DATE - INTERVAL '1 day')::date, 'YYYY-MM-DD') AS date_to
     FROM orders o
     LEFT JOIN time_slots pts ON pts.id = o.pickup_slot_id
     LEFT JOIN time_slots dts ON dts.id = o.delivery_slot_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.assigned_rider_id = $1
       AND ${dateColumn} >= (CURRENT_DATE - INTERVAL '${interval}')::date
       AND ${dateColumn} < CURRENT_DATE
       AND o.status = ANY($2::text[])
     ORDER BY o.id DESC`,
    [rider_id, statuses],
  );

  const missed = rows.map((row) => toMissedOrder(row, issueType));
  const pageItems = missed.slice(offset, offset + limit);

  const bounds =
    rows[0] ||
    (
      await sql.query(
        `SELECT
           TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS as_of_date,
           TO_CHAR((CURRENT_DATE - INTERVAL '${interval}')::date, 'YYYY-MM-DD') AS date_from,
           TO_CHAR((CURRENT_DATE - INTERVAL '1 day')::date, 'YYYY-MM-DD') AS date_to`,
      )
    ).rows[0];

  return {
    period,
    date_from: bounds?.date_from ?? null,
    date_to: bounds?.date_to ?? null,
    total: missed.length,
    page,
    limit,
    has_more: page * limit < missed.length,
    data: pageItems,
  };
};

export const fetchMissedPickups = (rider_id, query) =>
  fetchMissedOrders(rider_id, query, "missed_pickup");

export const fetchMissedDrops = (rider_id, query) =>
  fetchMissedOrders(rider_id, query, "missed_drop");

export const collectPaymentService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id,
            o.final_total, o.payment_status, o.amount_paid, o.remaining_amount
     FROM orders o
     WHERE o.id = $1`,
    [order_id],
  );

  if (rows.length === 0) throw { status: 404, message: 'Order not found' };

  const order = rows[0];

  if (order.assigned_rider_id !== rider_id) {
    throw { status: 403, message: 'You are not assigned to this order' };
  }

  if (order.status !== 'out_for_delivery') {
    throw { status: 400, message: 'Payment can only be collected when order is out_for_delivery' };
  }

  if (order.payment_status === 'paid') {
    return {
      order_id: parseInt(order_id, 10),
      payment_status: 'paid',
      amount_to_collect: 0,
      message: 'Payment has already been completed for this order',
    };
  }

  if (order.payment_status !== 'partially_paid') {
    throw { status: 400, message: 'Remaining payment requires advance to be paid first' };
  }

  if (order.final_total == null) {
    throw { status: 400, message: 'Final amount has not been calculated yet' };
  }

  const final_total = parseFloat(order.final_total);
  const amount_to_collect = Number(
    parseFloat(
      order.remaining_amount ?? final_total - parseFloat(order.amount_paid || 0),
    ).toFixed(2),
  );

  if (amount_to_collect <= 0) {
    return {
      order_id: parseInt(order_id, 10),
      payment_status: 'paid',
      amount_to_collect: 0,
      message: 'Payment has already been completed for this order',
    };
  }

  return {
    order_id: parseInt(order_id, 10),
    payment_status: order.payment_status,
    amount_to_collect,
    message: 'Please pay the remaining amount',
  };
};

export const createRiderPaymentOrderService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id,
            o.final_total, o.payment_status, o.amount_paid, o.remaining_amount
     FROM orders o
     WHERE o.id = $1`,
    [order_id],
  );

  if (rows.length === 0) throw { status: 404, message: 'Order not found' };

  const order = rows[0];

  if (order.assigned_rider_id !== rider_id) {
    throw { status: 403, message: 'You are not assigned to this order' };
  }

  if (order.status !== 'out_for_delivery') {
    throw { status: 400, message: 'Payment can only be collected when order is out_for_delivery' };
  }

  if (order.payment_status === 'paid') {
    throw { status: 400, message: 'Payment has already been completed for this order' };
  }

  if (order.payment_status !== 'partially_paid') {
    throw { status: 400, message: 'Remaining payment requires advance to be paid first' };
  }

  if (order.final_total == null) {
    throw { status: 400, message: 'Final amount has not been calculated yet' };
  }

  const final_total = parseFloat(order.final_total);
  const amount_to_collect = parseFloat(order.remaining_amount ?? final_total - parseFloat(order.amount_paid || 0)).toFixed(2);

  if (amount_to_collect <= 0) {
    throw { status: 400, message: 'No remaining amount to collect' };
  }

  const qr = await createRemainingPaymentQr({
    orderId: order_id,
    amountRupees: amount_to_collect,
  });

  return {
    order_id: parseInt(order_id, 10),
    amount_to_collect,
    amount: qr.amount,
    currency: qr.currency,
    qr_id: qr.qr_id,
    image_url: qr.image_url,
    image_content: qr.image_content,
    status: qr.status,
    close_by: qr.close_by,
    payment_type: qr.payment_type,
  };
};

export const pickupFromVendorService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT id, status, assigned_rider_id FROM orders WHERE id = $1`,
    [order_id]
  );

  if (rows.length === 0) throw { status: 404, message: 'Order not found' };

  const order = rows[0];

  if (order.assigned_rider_id !== rider_id) {
    throw { status: 403, message: 'You are not assigned to this order' };
  }

  if (order.status !== 'ready_for_delivery') {
    throw { status: 400, message: 'Order must be ready_for_delivery before pickup' };
  }

  await sql.query(
    `UPDATE orders SET status = 'out_for_delivery', out_for_delivery_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Notify user with delivery OTP (template 7 — at doorstep)
  const { rows: deliveryRows } = await sql.query(
    `SELECT o.user_id, o.delivery_otp, u.full_name, u.mobile
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [order_id],
  );
  if (deliveryRows.length > 0 && deliveryRows[0].delivery_otp) {
    const deliveryOtp = deliveryOtpTemplate({
      otp: deliveryRows[0].delivery_otp,
    });
    await createNotificationsBatch([
      {
        identity_id: deliveryRows[0].user_id,
        role: "user",
        title: deliveryOtp.title,
        message: deliveryOtp.message,
        reference_type: "order",
        reference_id: order_id,
        data: deliveryOtp.data,
      },
    ]);

    sendSmsToUserSafe(
      deliveryRows[0].user_id,
      SMS_TEMPLATE_KEYS.OTP_DELIVERY,
      { otp: deliveryRows[0].delivery_otp },
      { reference_type: "order", reference_id: order_id },
    );

    const { sendOrderOnTheWaySafe } = await import(
      "../whatsapp/gallaboxWhatsapp.service.js"
    );
    sendOrderOnTheWaySafe({
      mobile: deliveryRows[0].mobile,
      name: deliveryRows[0].full_name,
      orderId: order_id,
      otp: deliveryRows[0].delivery_otp,
    });
  }

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'out_for_delivery',
    timestamps,
    out_for_delivery_at: timestamps.out_for_delivery_at,
  };
};

export const verifyDeliveryOtpService = async (rider_id, order_id, otp) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id, o.user_id,
            o.delivery_otp, o.payment_status, o.final_total,
            u.full_name, u.mobile
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1`,
    [order_id]
  );

  if (rows.length === 0) throw { status: 404, message: 'Order not found' };

  const order = rows[0];

  if (order.assigned_rider_id !== rider_id) {
    throw { status: 403, message: 'You are not assigned to this order' };
  }

  if (order.status !== 'out_for_delivery') {
    throw { status: 400, message: 'Order must be out_for_delivery to verify OTP' };
  }

  if (!otpMatches(order.delivery_otp, otp)) {
    throw { status: 400, message: 'Invalid delivery OTP' };
  }

  await sql.query(
    `UPDATE orders SET status = 'delivered', delivery_completed_at = NOW(), delivered_at = CURRENT_DATE, updated_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Notify user with rating request (template 8)
  const rating = ratingRequestTemplate({ orderId: order_id });
  await createNotificationsBatch([{
    identity_id: order.user_id,
    role: 'user',
    title: rating.title,
    message: rating.message,
    reference_type: 'order',
    reference_id: order_id,
    data: rating.data,
  }]);

  sendSmsToUserSafe(order.user_id, SMS_TEMPLATE_KEYS.DELIVERY_SUCCESS, {}, {
    reference_type: "order",
    reference_id: order_id,
  });

  const { sendOrderDeliveredSafe } = await import(
    "../whatsapp/gallaboxWhatsapp.service.js"
  );
  sendOrderDeliveredSafe({
    mobile: order.mobile,
    name: order.full_name,
    orderId: order_id,
  });

  // Notify vendor that rider completed the delivery
  const vendorRow = await sql.query(
    `SELECT vendor_id FROM orders WHERE id = $1`,
    [order_id]
  );
  if (vendorRow.rows.length > 0) {
    await createNotificationsBatch([{
      identity_id: vendorRow.rows[0].vendor_id,
      role: 'vendor',
      title: 'Delivery Completed',
      message: `Order #${order_id} has been successfully delivered to the customer by the rider.`,
      reference_type: 'rider',
      reference_id: order_id,
    }]);
  }

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    order_id: parseInt(order_id, 10),
    status: 'delivered',
    timestamps,
    delivery_completed_at: timestamps.delivery_completed_at,
  };
};
