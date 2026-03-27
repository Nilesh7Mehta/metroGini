import sql from "../../config/db.js";
import { checkRiderReady } from "../../models/riders/rider.model.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";
import { generateOTP } from "../../utils/otp.js";

export const fetchTodayOrders = async (rider_id) => {
  const ready = await checkRiderReady(rider_id);
  if (!ready)
    throw {
      status: 400,
      message: "Rider must select shift and go online first",
    };

  const { rows } = await sql.query(
    `SELECT 
        o.id,TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date, o.status,
        ts.start_time, ts.end_time,
        u.full_name AS customer_name, u.id AS customer_id,
        a.complete_address, a.pincode
     FROM orders o
     JOIN time_slots ts ON ts.id = o.pickup_slot_id
     JOIN users u ON u.id = o.user_id
     JOIN user_address_details a ON a.id = o.address_id
     WHERE o.assigned_rider_id = $1 AND o.pickup_date = CURRENT_DATE
     ORDER BY ts.start_time ASC`,
    [rider_id],
  );
  return rows;
};

export const fetchDashboardCount = async (rider_id) => {
  const { rows } = await sql.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'out_for_pickup') AS pending_orders,
      COUNT(*) FILTER (WHERE status = 'pickup_in_progress') AS active_orders,
      COUNT(*) FILTER (WHERE status = 'picked_up') AS completed_orders
     FROM orders
     WHERE pickup_date >= CURRENT_DATE AND assigned_rider_id = $1`,
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

  await sql.query(`UPDATE orders SET status = 'pickup_in_progress' WHERE id = $1`, [
    order_id,
  ]);

  // Notify user rider is on the way
  const { rows: orderRows } = await sql.query(
    `SELECT user_id FROM orders WHERE id = $1`, [order_id]
  );
  if (orderRows.length > 0) {
    await createNotificationsBatch([{
      identity_id: orderRows[0].user_id,
      role: 'user',
      title: 'Rider On The Way',
      message: `Your rider is on the way to pick up order #${order_id}. Please keep your clothes ready.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
  }
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
  if (order.status !== "active")
    throw { status: 400, message: "Order is not in delivery stage" };
  if (order.pickup_otp !== otp) throw { status: 400, message: "Invalid OTP" };

  await sql.query(
    `UPDATE orders SET status = 'picked_up', otp_verified = 'true' WHERE id = $1`,
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
};

export const resendOtp = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.user_id, u.mobile
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 AND o.assigned_rider_id = $2 AND o.otp_verified = false`,
    [order_id, rider_id],
  );
  if (rows.length === 0) throw { status: 404, message: "Order not found" };

  const otp = generateOTP();
  await sql.query(`UPDATE orders SET pickup_otp = $1 WHERE id = $2`, [
    otp,
    order_id,
  ]);

  await createNotificationsBatch([
    {
      identity_id: rows[0].user_id,
      role: 'user',
      title: "Delivery OTP Resent",
      message: `Your delivery OTP is ${otp}`,
      reference_type: "order",
      reference_id: order_id,
    },
  ]);

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
  console.log( order.vendor_id , vendor_id);
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
       vendor_received_at = CURRENT_DATE
   WHERE id = $1`,
  [order_id]
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
            u.full_name AS customer_name,
            st.name AS service_type,
            uad.complete_address
     FROM orders o
     INNER JOIN users u ON u.id = o.user_id
     INNER JOIN service_types st ON st.id = o.service_type_id
     INNER JOIN user_address_details uad ON uad.id = o.address_id
     WHERE ${where}
     ORDER BY o.created_at DESC
     LIMIT $${index} OFFSET $${index + 1}`,
    values,
  );

  return { total, page: parseInt(page), limit: parseInt(limit), data: rows };
};

export const collectPaymentService = async (rider_id, order_id) => {
  const { rows } = await sql.query(
    `SELECT o.id, o.status, o.assigned_rider_id, o.user_id,
            o.final_total, o.payment_status
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
    throw { status: 400, message: 'Payment has already been completed for this order' };
  }

  const final_total = parseFloat(order.final_total);

  // If partially_paid, advance of ₹500 already collected — only collect the remaining
  const amount_to_collect = order.payment_status === 'partially_paid'
    ? parseFloat((final_total - 500).toFixed(2))
    : final_total;

  if (amount_to_collect <= 0) {
    throw { status: 400, message: 'No remaining amount to collect' };
  }

  await sql.query(
    `INSERT INTO payments (order_id, payment_type, payment_method, amount, status , paid_at)
     VALUES ($1, 'remaining', 'cash', $2, 'success' , NOW())`,
    [order_id, amount_to_collect]
  );

  await sql.query(
    `UPDATE orders SET payment_status = 'paid',  updated_at = NOW() WHERE id = $1`,
    [order_id]
  );

  await createNotificationsBatch([{
    identity_id: order.user_id,
    role: 'user',
    title: 'Payment Received',
    message: `Cash payment of ₹${amount_to_collect} collected by rider.`,
    reference_type: 'order',
    reference_id: order_id,
  }]);

  return {
    order_id: parseInt(order_id),
    payment_method: 'cash',
    amount_collected: amount_to_collect,
    payment_status: 'paid',
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
    `UPDATE orders SET status = 'out_for_delivery', updated_at = NOW() WHERE id = $1`,
    [order_id]
  );

  // Notify user their laundry is out for delivery
  const { rows: deliveryRows } = await sql.query(
    `SELECT user_id FROM orders WHERE id = $1`, [order_id]
  );
  if (deliveryRows.length > 0) {
    await createNotificationsBatch([{
      identity_id: deliveryRows[0].user_id,
      role: 'user',
      title: 'Out For Delivery',
      message: `Your laundry for order #${order_id} is on its way. The rider will arrive at your delivery slot.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
  }
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
    `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
    [order_id]
  );

  // Notify user
  await createNotificationsBatch([{
    identity_id: order.user_id,
    role: 'user',
    title: 'Order Delivered',
    message: 'Your laundry has been delivered successfully. Thank you for using our service.',
    reference_type: 'order',
    reference_id: order_id,
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
};
