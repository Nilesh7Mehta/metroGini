import sql from '../../config/db.js';
import { assignOrdersToRider } from '../../models/riders/orderSplit.model.js';
import { checkRiderReady } from '../../models/riders/rider.model.js';
import { createNotificationsBatch } from '../../utils/notificationHelper.js';
import { generateOTP } from "../../utils/otp.js";

export const getTodayOrderList = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;

    // 1️⃣ Check rider status
    const ready = await checkRiderReady(rider_id);

    if (!ready) {
      return res.status(400).json({
        status: false,
        message: "Rider must select shift and go online first"
      });
    }

    // 3️⃣ Get orders
    const orders = await assignOrdersToRider(rider_id);

    return res.status(200).json({
      status: true,
      data: orders
    });

  } catch (error) {
    next(error);
  }
};

export const getDashboardCount = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;

    const { rows } = await sql.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'out_for_pickup') AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'active') AS active_orders,
        COUNT(*) FILTER (WHERE status = 'done') AS completed_orders
      FROM orders
      WHERE pickup_date >= CURRENT_DATE
      AND assigned_rider_id = $1`,
      [rider_id]
    );

    return res.status(200).json({
      status: true,
      data: rows[0]
    });

  } catch (error) {
    next(error);
  }
};

//startOrderDelivery
export const startOrderDelivery = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;
    const order_id = req.params.id;

    // 1️⃣ Check if rider already has active order
    const { rows: activeOrders } = await sql.query(
      `SELECT id
       FROM orders
       WHERE assigned_rider_id = $1
       AND status = 'active'`,
      [rider_id]
    );

    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Finish current delivery  before starting another"
      });
    }

    // 2️⃣ Check order belongs to rider
    const { rows } = await sql.query(
      `SELECT id, status, assigned_rider_id
       FROM orders
       WHERE id = $1`,
      [order_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = rows[0];

    if (order.assigned_rider_id !== rider_id) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this order"
      });
    }

    if (order.status !== "out_for_pickup") {
      return res.status(400).json({
        success: false,
        message: "Order cannot be started"
      });
    }

    // 3️⃣ Start delivery
    await sql.query(
      `UPDATE orders
       SET status = 'active'
       WHERE id = $1`,
      [order_id]
    );

    return res.status(200).json({
      success: true,
      message: `Delivery started for Order Id = ORD-${order_id}`
    });

  } catch (error) {
    next(error);
  }
};

//verify Delivery OTP
export const verifyDeliveryOtp = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;
    const { order_id, otp } = req.body;

    const { rows } = await sql.query(
      `SELECT id, pickup_otp , assigned_rider_id, status
       FROM orders
       WHERE id = $1`,
      [order_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = rows[0];

    if (order.assigned_rider_id !== rider_id) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this order"
      });
    }

    if (order.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Order is not in delivery stage"
      });
    }

    console.log("PickUP" , order.pickup_otp);
    console.log("OTP" , otp);

    if (order.pickup_otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    await sql.query(
      `UPDATE orders
       SET status = 'done' , otp_verified = 'true'
       WHERE id = $1`,
      [order_id]
    );

    return res.status(200).json({
      success: true,
      message: "Delivery completed successfully"
    });

  } catch (error) {
    next(error);
  }
};

export const resendDeliveryOtp = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;
    const { order_id } = req.body;

    const { rows } = await sql.query(
      `SELECT o.id, o.user_id, u.mobile
      FROM orders o
      INNER JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
      AND o.assigned_rider_id = $2
      AND o.otp_verified = false`,
      [order_id, rider_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    const order = rows[0];
    
    const otp = generateOTP();

    // update OTP
    await sql.query(
      `UPDATE orders
       SET pickup_otp = $1
       WHERE id = $2`,
      [otp, order_id]
    );

    // send notification to customer
    await createNotificationsBatch([
      {
        user_id: order.user_id,
        title: "Delivery OTP Resent",
        message: `Your delivery OTP is ${otp}`,
        reference_type: "order",
        reference_id: order_id
      }
    ]);

    // optional SMS
    // await sendSMS(order.mobile, `Your delivery OTP is ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to customer" , 
      otp  //Remove in Prod
    });

  } catch (error) {
    next(error);
  }
};

export const getOrderHistory = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;

    const {
      order_type,
      status,
      time_filter,
      page = 1,
      limit = 10
    } = req.query;

    const offset = (page - 1) * limit;

    let conditions = [`o.assigned_rider_id = $1`];
    let values = [rider_id];
    let index = 2;

    // Order Type
    if (order_type === "regular") {
      conditions.push(`st.name = $${index}`);
      values.push("Regular Service");
      index++;
    }

    if (order_type === "express") {
      conditions.push(`st.name = $${index}`);
      values.push("Express Service");
      index++;
    }

    // Status
    if (status === "pending") {
      conditions.push(`o.status = $${index}`);
      values.push("out_for_pickup");
      index++;
    }

    if (status === "in_process") {
      conditions.push(`o.status = $${index}`);
      values.push("active");
      index++;
    }

    if (status === "delivered") {
      conditions.push(`o.status = $${index}`);
      values.push("done");
      index++;
    }

    // Time Filters
    if (time_filter === "today") {
      conditions.push(`DATE(o.created_at) = CURRENT_DATE`);
    }

    if (time_filter === "7days") {
      conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '7 days'`);
    }

    if (time_filter === "30days") {
      conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '30 days'`);
    }

    if (time_filter === "6months") {
      conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '6 months'`);
    }

    if (time_filter === "1year") {
      conditions.push(`o.created_at >= CURRENT_DATE - INTERVAL '1 year'`);
    }

    // Total count
    const countQuery = `
      SELECT COUNT(*)
      FROM orders o
      INNER JOIN service_types st ON st.id = o.service_type_id
      WHERE ${conditions.join(" AND ")}
    `;

    const { rows: countRows } = await sql.query(countQuery, values);
    const total = parseInt(countRows[0].count);

    // Data query
    const query = `
      SELECT
        o.id,
        o.status,
        o.created_at,
        u.full_name AS customer_name,
        st.name AS service_type,
        uad.complete_address
      FROM orders o
      INNER JOIN users u ON u.id = o.user_id
      INNER JOIN service_types st ON st.id = o.service_type_id
      INNER JOIN user_address_details uad ON uad.id = o.address_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY o.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    values.push(limit);
    values.push(offset);

    const { rows } = await sql.query(query, values);

    return res.status(200).json({
      success: true,
      page: parseInt(page),
      limit: parseInt(limit),
      total_orders: total,
      total_pages: Math.ceil(total / limit),
      data: rows
    });

  } catch (error) {
    next(error);
  }
};