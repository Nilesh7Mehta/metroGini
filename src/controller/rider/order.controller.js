import sql from '../../config/db.js';
import { assignOrdersToRider } from '../../models/riders/orderSplit.model.js';
import { checkRiderReady } from '../../models/riders/rider.model.js';

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

    // 2️⃣ Get rider position
    const { rows } = await sql.query(
      `SELECT COUNT(*) AS position
       FROM riders
       WHERE is_active = true
       AND id <= $1`,
      [rider_id]
    );

    const riderPosition = rows[0].position - 1;

    // 3️⃣ Get orders
    const orders = await assignOrdersToRider(riderPosition);

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