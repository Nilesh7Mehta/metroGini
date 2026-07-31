import sql from "../../config/db.js";
import { checkRiderReady } from "../../models/riders/rider.model.js";
import { buildOrderTimestamps, fetchOrderTimestamps } from "../../utils/datetime.util.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";
import { PAYMENT_TYPE } from "../../utils/status.js";
import { sendUserEmailSafe, sendFullPaymentEmail, sendPickupOtpEmail } from "../common/email.service.js";
import { createRazorpayOrder } from "../users/payment/razorpayCheckout.service.js";
import { generateOTP } from "../../utils/otp.js";
import {
  deliveryOtpTemplate,
  pickupOtpTemplate,
  ratingRequestTemplate,
} from "../../utils/userNotificationTemplates.js";

const attachOrderTimestamps = (row) => ({
  ...row,
  timestamps: buildOrderTimestamps(row),
});

export const fetchTodayOrders = async (rider_id) => {
  const ready = await checkRiderReady(rider_id);
  if (!ready)
    throw {
      status: 400,
      message: "Rider must select shift and go online first",
    };

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
        a.complete_address, a.pincode
     FROM orders o
     JOIN time_slots ts ON ts.id = o.pickup_slot_id
     JOIN users u ON u.id = o.user_id
     JOIN user_address_details a ON a.id = o.address_id
     WHERE o.assigned_rider_id = $1
       AND o.pickup_date = CURRENT_DATE
       AND o.status IN ('out_for_pickup', 'pickup_in_progress', 'in_process')
     ORDER BY o.id DESC`,
    [rider_id],
  );
  return rows.map(attachOrderTimestamps);
};

export const fetchTodayDeliveryOrders = async (rider_id) => {
  const ready = await checkRiderReady(rider_id);
  if (!ready)
    throw {
      status: 400,
      message: "Rider must select shift and go online first",
    };
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
        a.complete_address,
        a.pincode,
        v.laundry_shop_name AS vendor_name,
        v.shop_address AS shop_address
     FROM orders o
     JOIN time_slots ts ON ts.id = o.delivery_slot_id
     JOIN users u ON u.id = o.user_id
     JOIN user_address_details a ON a.id = o.address_id
     LEFT JOIN vendors v ON v.id = o.vendor_id
     WHERE o.assigned_rider_id = $1
       AND o.delivery_date = CURRENT_DATE
       AND o.status IN ('in_process', 'ready_for_delivery', 'out_for_delivery')
     ORDER BY o.id DESC`,
    [rider_id],
  );
  return rows.map(attachOrderTimestamps);
};

export const fetchDashboardCount = async (rider_id) => {
  const { rows } = await sql.query(
    `SELECT
    COUNT(*) FILTER (
        WHERE status IN ('out_for_pickup','pickup_in_progress')
          AND pickup_date = CURRENT_DATE
    ) AS pending_pickup,

    COUNT(*) FILTER (
        WHERE status = 'in_process'
          AND pickup_date = CURRENT_DATE
    ) AS completed_pickup,

    COUNT(*) FILTER (
        WHERE status IN ('ready_for_delivery', 'out_for_delivery')
          AND delivery_date = CURRENT_DATE
    ) AS pending_drop,

    COUNT(*) FILTER (
        WHERE status = 'delivered'
          AND delivery_date = CURRENT_DATE
    ) AS completed_drop

    FROM orders
    WHERE assigned_rider_id = $1;`,
    [rider_id],
  );
  return rows[0];
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
    `SELECT user_id, order_code, pickup_otp FROM orders WHERE id = $1`,
    [order_id],
  );
  if (orderRows.length > 0) {
    const otp = orderRows[0].pickup_otp || generateOTP();
    if (!orderRows[0].pickup_otp) {
      await sql.query(`UPDATE orders SET pickup_otp = $1 WHERE id = $2`, [
        otp,
        order_id,
      ]);
    }

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
  if (order.pickup_otp !== otp) throw { status: 400, message: "Invalid OTP" };

  await sql.query(
    `UPDATE orders SET status = 'picked_up', otp_verified = 'true', pickup_completed_at = NOW() WHERE id = $1`,
    [order_id],
  );

  // Notify user clothes have been picked up
  const { rows: pickedRows } = await sql.query(
    `SELECT user_id FROM orders WHERE id = $1`, [order_id]
  );
  if (pickedRows.length > 0) {
    await createNotificationsBatch([{
      identity_id: pickedRows[0].user_id,
      role: 'user',
      title: 'Clothes Picked Up',
      message: `Your clothes for order #${order_id} have been picked up and are on the way to the laundry.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
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
  const { rows } = await sql.query(
    `SELECT o.id, o.user_id, o.order_code, u.mobile
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 AND o.assigned_rider_id = $2 AND o.otp_verified = false`,
    [order_id, rider_id],
  );
  if (rows.length === 0) throw { status: 404, message: "Order not found" };

  const order = rows[0];
  const otp = generateOTP();
  await sql.query(`UPDATE orders SET pickup_otp = $1 WHERE id = $2`, [
    otp,
    order_id,
  ]);

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

  return otp;
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

export const fetchOrderHistory = async (rider_id, query) => {
  const { order_type, status, time_filter, page = 1, limit = 10 } = query;
  const offset = (page - 1) * limit;

  let conditions = [`o.assigned_rider_id = $1`];
  let values = [rider_id];
  let index = 2;

  if (order_type === "regular") {
    conditions.push(`st.name = $${index++}`);
    values.push("Regular Service");
  }
  if (order_type === "express") {
    conditions.push(`st.name = $${index++}`);
    values.push("Express Service");
  }

  if (status === "pending") {
    conditions.push(`o.status = $${index++}`);
    values.push("out_for_pickup");
  }
  if (status === "in_process") {
    conditions.push(`o.status = $${index++}`);
    values.push("active");
  }
  if (status === "delivered") {
    conditions.push(`o.status = $${index++}`);
    values.push("done");
  }

  if (time_filter === "today")
    conditions.push(`DATE(o.created_at) = CURRENT_DATE`);
  if (time_filter === "7days")
    conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '7 days'`);
  if (time_filter === "30days")
    conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '30 days'`);
  if (time_filter === "6months")
    conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '6 months'`);
  if (time_filter === "1year")
    conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '1 year'`);

  const where = conditions.join(" AND ");

  const { rows: countRows } = await sql.query(
    `SELECT COUNT(*) FROM orders o INNER JOIN service_types st ON st.id = o.service_type_id WHERE ${where}`,
    values,
  );
  const total = parseInt(countRows[0].count);

  values.push(limit, offset);
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.created_at,
            o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
            o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
            o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
            o.updated_at, o.otp_generated_at,
            u.full_name AS customer_name,
            st.name AS service_type,
            uad.complete_address
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     INNER JOIN service_types st ON st.id = o.service_type_id
     INNER JOIN user_address_details uad ON uad.id = o.address_id
     WHERE ${where}
     ORDER BY o.id DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    values,
  );

  return {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    data: rows.map(attachOrderTimestamps),
  };
};

export const collectPaymentService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id, o.user_id,
            o.final_total, o.payment_status, o.amount_paid, o.remaining_amount
     FROM orders o
     WHERE o.id = $1`,
    [order_id]
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
      amount_paid: true,
      message: 'Payment has already been completed for this order',
    };
  }

  const final_total = parseFloat(order.final_total);

  const amount_to_collect =
    order.payment_status === 'partially_paid'
      ? parseFloat(order.remaining_amount ?? final_total - parseFloat(order.amount_paid || 0)).toFixed(2)
      : final_total;

  if (amount_to_collect <= 0) {
    return {
      order_id: parseInt(order_id, 10),
      payment_status: 'paid',
      message: 'Payment has already been completed for this order',
    };
  }

  return {
    order_id: parseInt(order_id, 10),
    amount_to_collect,
    payment_status: 'partially_paid',
  };
};

export const createRiderPaymentOrderService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id, o.user_id,
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

  const checkout = await createRazorpayOrder({
    orderId: order_id,
    userId: order.user_id,
    body: {
      payment_type: PAYMENT_TYPE.REMAINING,
      amount: amount_to_collect,
    },
  });

  return {
    order_id: parseInt(order_id, 10),
    amount_to_collect,
    key_id: checkout.key_id,
    razorpay_order_id: checkout.order_id,
    amount: checkout.amount,
    currency: checkout.currency,
    payment_type: checkout.payment_type,
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
    `SELECT user_id, delivery_otp FROM orders WHERE id = $1`,
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
            o.delivery_otp, o.payment_status, o.final_total
     FROM orders o WHERE o.id = $1`,
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

  if (order.delivery_otp !== otp) {
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
