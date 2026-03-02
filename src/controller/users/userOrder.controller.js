import sql from "../config/db.js";
import { calculateOrderPricing } from "../utils/price.util.js";

export const createDraftOrder = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const { service_id, clothes_count } = req.body;
    const user_id = req.user.id;

    // ✅ Validate clothes count
    if (!clothes_count || clothes_count < 10) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Minimum 10 clothes required",
      });
    }

    // ✅ Get selected address ID from separate table
    const addressResult = await client.query(
      `SELECT id
       FROM user_address_details
       WHERE user_id = $1 AND is_selected = true
       LIMIT 1`,
      [user_id],
    );

    const addressId = addressResult.rows[0]?.id;

    if (!addressId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Please select a delivery address",
      });
    }

    // ✅ Round to nearest 0.5
    const min_weight = Math.round(clothes_count * 0.4 * 2) / 2;
    const max_weight = Math.round(clothes_count * 0.7 * 2) / 2;

    // ✅ Check if draft already exists
    const existingDraft = await client.query(
      `SELECT id
       FROM orders
       WHERE user_id = $1 AND status = 'draft'
       LIMIT 1`,
      [user_id],
    );

    let orderId;

    if (existingDraft.rows.length > 0) {
      // 🔄 Update existing draft
      const updateResult = await client.query(
        `UPDATE orders
         SET service_id = $1,
             clothes_count = $2,
             estimated_weight_min = $3,
             estimated_weight_max = $4,
             address_id = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id`,
        [
          service_id,
          clothes_count,
          min_weight,
          max_weight,
          addressId,
          existingDraft.rows[0].id,
        ],
      );

      orderId = updateResult.rows[0].id;
    } else {
      // ➕ Insert new draft
      const insertResult = await client.query(
        `INSERT INTO orders
         (user_id, service_id, clothes_count,
          estimated_weight_min, estimated_weight_max,
          address_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft')
         RETURNING id`,
        [user_id, service_id, clothes_count, min_weight, max_weight, addressId],
      );

      orderId = insertResult.rows[0].id;
    }

    await client.query("COMMIT");

    return res.status(200).json({
      order_id: orderId,
      estimated_weight_min: min_weight,
      estimated_weight_max: max_weight,
      message: "Order created successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const updateServiceType = async (req, res, next) => {
  try {
    const { service_type_id } = req.body;
    // console.log("Received service_type_id:", service_type_id);
    const order_id = req.params.id;
    const user_id = req.user.id;

    if (!service_type_id) {
      return res.status(400).json({
        message: "service_type_id is required",
      });
    }

    // ✅ Update only if order belongs to user AND is draft
    const result = await sql.query(
      `UPDATE orders
       SET service_type_id = $1,
           updated_at = NOW()
       WHERE id = $2
         AND user_id = $3
         AND status = 'draft'
       RETURNING id`,
      [service_type_id, order_id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found or cannot be updated",
      });
    }

    return res.status(200).json({
      order_id: result.rows[0].id,
      message: "Service type updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const updatePickup = async (req, res, next) => {
  try {
    const pickup_date = req.body?.pickup_date;
    const pickup_slot_id = req.body?.pickup_slot_id;

    const order_id = req.params.id;
    const user_id = req.user.id;

    // ✅ Validate input
    if (!pickup_date || !pickup_slot_id) {
      return res.status(400).json({
        message: "pickup_date and pickup_slot_id are required",
      });
    }

    // ✅ Validate date format (basic check)
    if (isNaN(new Date(pickup_date).getTime())) {
      return res.status(400).json({
        message: "Invalid pickup date",
      });
    }

    // ✅ Check if slot exists & active
    const slot = await sql.query(
      `SELECT id FROM time_slots
       WHERE id = $1 AND is_active = TRUE`,
      [pickup_slot_id],
    );

    if (slot.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or inactive time slot",
      });
    }

    // ✅ Update only if draft + belongs to user
    const result = await sql.query(
      `UPDATE orders
       SET pickup_date = $1,
           pickup_slot_id = $2,
           updated_at = NOW()
       WHERE id = $3
         AND user_id = $4
         AND status = 'draft'
       RETURNING id`,
      [pickup_date, pickup_slot_id, order_id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found",
      });
    }

    return res.status(200).json({
      message: "Pickup details updated successfully",
      order_id: result.rows[0].id,
      pickup_date,
      pickup_slot_id,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDelivery = async (req, res, next) => {
  try {
    const { delivery_date, delivery_slot_id } = req.body;
    const order_id = req.params.id;
    const user_id = req.user.id;

    if (!delivery_date || !delivery_slot_id) {
      return res.status(400).json({
        message: "delivery_date and delivery_slot_id are required",
      });
    }

    // 🔹 Fetch pickup + delivery hours
    const orderCheck = await sql.query(
      `SELECT o.pickup_date,
              ps.start_time AS pickup_start_time,
              st.delivery_hours
       FROM orders o
       JOIN time_slots ps ON o.pickup_slot_id = ps.id
       JOIN service_types st ON o.service_type_id = st.id
       WHERE o.id = $1
         AND o.user_id = $2
         AND o.status = 'draft'`,
      [order_id, user_id],
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found or pickup not selected",
      });
    }

    const { pickup_date, pickup_start_time, delivery_hours } =
      orderCheck.rows[0];

    const pickupDateStr =
      typeof pickup_date === "string"
        ? pickup_date
        : pickup_date.toLocaleDateString("en-CA");

    const pickupDateTime = new Date(`${pickupDateStr}T${pickup_start_time}`);

    // 🔹 Fetch delivery slot
    const deliverySlot = await sql.query(
      `SELECT start_time
       FROM time_slots
       WHERE id = $1 AND is_active = TRUE`,
      [delivery_slot_id],
    );

    if (deliverySlot.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or inactive delivery time slot",
      });
    }

    const delivery_start_time = deliverySlot.rows[0].start_time;

    const deliveryDateTime = new Date(
      `${delivery_date}T${delivery_start_time}`,
    );

    const minDeliveryTime =
      pickupDateTime.getTime() + delivery_hours * 60 * 60 * 1000;

    if (deliveryDateTime.getTime() < minDeliveryTime) {
      const minDate = new Date(minDeliveryTime).toLocaleDateString("en-CA");

      return res.status(400).json({
        message: `Delivery must be at least ${delivery_hours} hours after pickup`,
        pickup_date: pickupDateStr,
        minimum_allowed_delivery_date: minDate,
      });
    }

    // ✅ Update
    await sql.query(
      `UPDATE orders
       SET delivery_date = $1,
           delivery_slot_id = $2,
           updated_at = NOW()
       WHERE id = $3
         AND user_id = $4
         AND status = 'draft'`,
      [delivery_date, delivery_slot_id, order_id, user_id],
    );

    return res.status(200).json({
      message: "Delivery details updated successfully",
      order_id: order_id,
      delivery_date,
      delivery_slot_id,
    });
  } catch (error) {
    next(error);
  }
};

export const finalizeOrder = async (req, res, next) => {
  try {
    const order_id = req.params.id;
    const user_id = req.user.id;

    const orderResult = await sql.query(
      `SELECT o.*, 
              s.base_price_per_kg,
              st.extra_price_per_kg,
              st.flat_fee,
              ts.is_peak,
              ts.peak_extra_charge
       FROM orders o
       JOIN services s ON o.service_id = s.id
       JOIN service_types st ON o.service_type_id = st.id
       LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
       WHERE o.id = $1
         AND o.user_id = $2
         AND o.status = 'draft'`,
      [order_id, user_id],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found",
      });
    }

    const order = orderResult.rows[0];

    if (
      !order.service_type_id ||
      !order.pickup_date ||
      !order.delivery_date ||
      !order.address_id
    ) {
      return res.status(400).json({
        message: "Please complete all steps before finalizing",
      });
    }

    const avg_weight =
      (Number(order.estimated_weight_min) +
        Number(order.estimated_weight_max)) /
      2;

    const base = avg_weight * Number(order.base_price_per_kg);

    const type_extra = avg_weight * Number(order.extra_price_per_kg);

    const flat_fee = Number(order.flat_fee);

    const peak_charge = order.is_peak ? Number(order.peak_extra_charge) : 0;

    const estimated_total = base + type_extra + flat_fee + peak_charge;

    await sql.query(
      `UPDATE orders
       SET base_price_per_kg = $1,
           extra_price_per_kg = $2,
           flat_fee = $3,
           peak_extra_charge = $4,
           estimated_total = $5,
           status = 'created',
           updated_at = NOW()
       WHERE id = $6`,
      [
        order.base_price_per_kg,
        order.extra_price_per_kg,
        order.flat_fee,
        peak_charge,
        estimated_total,
        order_id,
      ],
    );

    return res.status(200).json({
      message: "Order finalized successfully",
      order_id,
      estimated_total: estimated_total.toFixed(2),
    });
  } catch (error) {
    next(error);
  }
};

export const reviewOrder = async (req, res, next) => {
  try {
    const order_id = req.params.id;
    const user_id = req.user.id;

    const result = await sql.query(
      `SELECT 
      o.*,

      s.name AS service_name,
      s.base_price_per_kg,

      st.name AS service_type_name,
      st.extra_price_per_kg,
      st.flat_fee,

      pickup_slot.start_time AS pickup_start,
      pickup_slot.end_time AS pickup_end,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,

      TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,

      delivery_slot.start_time AS delivery_start,
      delivery_slot.end_time AS delivery_end,

      ua.complete_address AS full_address,

      ts.is_peak,
      ts.peak_extra_charge,

      c.id AS coupon_id,
      c.coupon_code,
      c.discount_type,
      c.discount_value,
      c.minimum_amount_value

   FROM orders o
   JOIN services s ON o.service_id = s.id
   JOIN service_types st ON o.service_type_id = st.id

   LEFT JOIN time_slots pickup_slot 
        ON o.pickup_slot_id = pickup_slot.id

   LEFT JOIN time_slots delivery_slot 
        ON o.delivery_slot_id = delivery_slot.id

   LEFT JOIN user_address_details ua 
        ON o.address_id = ua.id

   LEFT JOIN time_slots ts 
        ON o.pickup_slot_id = ts.id

   LEFT JOIN coupons c
        ON o.applied_coupon_id = c.id

   WHERE o.id = $1
     AND o.user_id = $2
     AND o.status = 'created'`,
      [order_id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Created order not found" });
    }

    const order = result.rows[0];

    // ✅ Call pricing function
    const pricing = calculateOrderPricing(order);

    return res.status(200).json({
      order_id,

      service_details: {
        service_name: order.service_name,
        service_type: order.service_type_name,
        clothes_count: order.clothes_count,
        estimated_weight_range: `${order.estimated_weight_min} - ${order.estimated_weight_max} kg`,
      },

      schedule: {
        pickup: {
          date: order.pickup_date,
          slot: `${order.pickup_start} - ${order.pickup_end}`,
        },
        delivery: {
          date: order.delivery_date,
          slot: `${order.delivery_start} - ${order.delivery_end}`,
        },
      },

      address: order.full_address,

      pricing_breakdown: {
        service_charge: pricing.service_charge.toFixed(2),
        peak_charge: pricing.peak_charge.toFixed(2),

        coupon: order.coupon_code
          ? {
              coupon_code: order.coupon_code,
              discount_type: order.discount_type,
              discount_value: order.discount_value,
            }
          : null,

        discount: pricing.discount.toFixed(2),

        advance_payment: pricing.advance_payment.toFixed(2),

        remaining_payment:
          pricing.remaining_payment > 0
            ? pricing.remaining_payment.toFixed(2)
            : "0.00",

        total_payable_now: pricing.advance_payment.toFixed(2),
        approx_total: pricing.final_total.toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const applyCoupon = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;
    const { coupon_code } = req.body;

    if (!coupon_code) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Coupon code is required",
      });
    }

    // 1️⃣ Validate Order
    const orderResult = await client.query(
      `SELECT id, applied_coupon_id
       FROM orders
       WHERE id = $1
       AND user_id = $2
       AND status = 'created'
       FOR UPDATE`,
      [order_id, user_id]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // 2️⃣ Validate Coupon
    const couponResult = await client.query(
      `SELECT *
       FROM coupons
       WHERE UPPER(coupon_code) = UPPER($1)
       AND is_active = true
       AND start_date <= CURRENT_TIMESTAMP
       AND end_date >= CURRENT_TIMESTAMP`,
      [coupon_code]
    );

    if (couponResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Invalid or expired coupon",
      });
    }

    const coupon = couponResult.rows[0];

    // 🔥 Special check for CANCEL500 (user-specific reward)
    if (coupon.coupon_code === "CANCEL500") {
      const eligibilityCheck = await client.query(
        `SELECT id
         FROM coupon_usages
         WHERE coupon_id = $1
         AND user_id = $2
         AND is_used = FALSE
         AND expiry_date >= CURRENT_TIMESTAMP`,
        [coupon.id, user_id]
      );

      if (eligibilityCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "You are not eligible to use this coupon",
        });
      }
    }

    // 3️⃣ Global usage limit
    if (
      coupon.usage_limit !== null &&
      coupon.used_count >= coupon.usage_limit
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Coupon usage limit exceeded",
      });
    }

    // 4️⃣ Per-user limit (for normal coupons)
    if (coupon.per_user_limit !== null) {
      const usageCheck = await client.query(
        `SELECT COUNT(*) 
         FROM coupon_usages
         WHERE coupon_id = $1
         AND user_id = $2
         AND is_used = TRUE`,
        [coupon.id, user_id]
      );

      const userUsageCount = Number(usageCheck.rows[0].count);

      if (userUsageCount >= coupon.per_user_limit) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "You have already used this coupon",
        });
      }
    }

    // 5️⃣ Apply coupon to order
    await client.query(
      `UPDATE orders
       SET applied_coupon_id = $1
       WHERE id = $2`,
      [coupon.id, order_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Coupon applied successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const removeCoupon = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;

    // 🔒 Lock order
    const orderResult = await client.query(
      `SELECT applied_coupon_id
       FROM orders
       WHERE id = $1
       AND user_id = $2
       AND status = 'created'
       FOR UPDATE`,
      [order_id, user_id]
    );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const appliedCouponId = orderResult.rows[0].applied_coupon_id;

    if (!appliedCouponId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "No coupon applied to this order",
      });
    }

    // ✅ Remove coupon
    await client.query(
      `UPDATE orders
       SET applied_coupon_id = NULL
       WHERE id = $1`,
      [order_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Coupon removed successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

//get User Order by id
export const getUserOrder = async (req, res, next) => {
  try {
    const user_id = req.user.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { status, time } = req.query;

    let whereConditions = [`o.user_id = $1`];
    let values = [user_id];
    let paramIndex = 2;

    // ✅ Status Mapping (UI → DB)
    if (status && status !== "all") {
      const statusMap = {
        booked: "confirmed",
        picked_up: "picked_up",
        in_process: "in_process",
        delivered: "delivered",
        cancelled: "cancelled",
      };

      const dbStatus = statusMap[status];

      if (dbStatus) {
        whereConditions.push(`o.status = $${paramIndex}`);
        values.push(dbStatus);
        paramIndex++;
      }
    }

    // ✅ Time Filter
    if (time && time !== "anytime") {
      let intervalQuery = "";

      switch (time) {
        case "last_7_days":
          intervalQuery = "NOW() - INTERVAL '7 days'";
          break;
        case "last_30_days":
          intervalQuery = "NOW() - INTERVAL '30 days'";
          break;
        case "last_6_months":
          intervalQuery = "NOW() - INTERVAL '6 months'";
          break;
        case "last_year":
          intervalQuery = "NOW() - INTERVAL '1 year'";
          break;
      }

      if (intervalQuery) {
        whereConditions.push(`o.created_at >= ${intervalQuery}`);
      }
    }

    const whereClause = whereConditions.join(" AND ");


    // ✅ Count Query
    const countResult = await sql.query(
      `
      SELECT COUNT(*)
      FROM orders o
      JOIN payments p 
        ON p.order_id = o.id
        AND p.payment_type = 'advance'
        AND p.status = 'success'
      WHERE ${whereClause}
      `,
      values
    );

    const totalOrders = parseInt(countResult.rows[0].count);

    // ✅ Data Query
    const result = await sql.query(
      `
      SELECT 
        o.id,
        o.clothes_count,
        o.estimated_weight_min,
        o.estimated_weight_max,

        s.name AS service_name,
        s.image AS service_image,

        pickup_slot.start_time AS pickup_start,
        pickup_slot.end_time AS pickup_end,
        TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,

        delivery_slot.start_time AS delivery_start,
        delivery_slot.end_time AS delivery_end,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,

        p.amount AS advance_amount,
        p.payment_method

      FROM orders o

      JOIN payments p 
        ON p.order_id = o.id
        AND p.payment_type = 'advance'
        AND p.status = 'success'

      JOIN services s 
        ON o.service_id = s.id

      LEFT JOIN time_slots pickup_slot 
        ON o.pickup_slot_id = pickup_slot.id

      LEFT JOIN time_slots delivery_slot 
        ON o.delivery_slot_id = delivery_slot.id

      WHERE ${whereClause}

      ORDER BY o.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      [...values, limit, offset]
    );

    const formattedOrders = result.rows.map(order => ({
      order_id: order.id,

      service_name: order.service_name,
      service_image: order.service_image,

      pickup_slot: {
        date: order.pickup_date,
        time: `${order.pickup_start} - ${order.pickup_end}`,
      },

      delivery_slot: {
        date: order.delivery_date,
        time: `${order.delivery_start} - ${order.delivery_end}`,
      },

      item_details: {
        clothes_count: order.clothes_count,
        estimated_weight: `${order.estimated_weight_min} - ${order.estimated_weight_max} kg`,
      },

      payment_status: `Advance ${order.advance_amount} via ${order.payment_method}`,
    }));

    return res.status(200).json({
      status: 200,
      message:
        formattedOrders.length > 0
          ? "Orders fetched successfully"
          : "No orders found",
      data: formattedOrders,
      pagination: {
        total: totalOrders,
        current_page: page,
        total_pages: Math.ceil(totalOrders / limit),
        per_page: limit,
      },
    });

  } catch (error) {
    next(error);
  }
};

//reschedule Order
export const rescheduleOrderPickup = async (req, res, next) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;
    const { pickup_date, pickup_slot_id } = req.body;

    if (!pickup_date || !pickup_slot_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Pickup date and slot are required",
      });
    }

    // 🔒 Lock order + validate status + validate advance payment
    const orderCheck = await client.query(
      `
      SELECT o.pickup_date,
             ts.start_time
      FROM orders o
      JOIN time_slots ts ON o.pickup_slot_id = ts.id
      JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1
        AND o.user_id = $2
        AND o.status = 'created'
        AND p.payment_type = 'advance'
        AND p.status = 'success'
      FOR UPDATE
      `,
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Order cannot be rescheduled. Either status invalid or advance payment not completed.",
      });
    }

    const order = orderCheck.rows[0];

    // Combine existing pickup date + time
    const pickupDateTime = new Date(
      `${order.pickup_date.toISOString().split("T")[0]}T${order.start_time}`
    );

    const now = new Date();
    const diffInHours = (pickupDateTime - now) / (1000 * 60 * 60);

    // ⏳ Must be at least 12 hours before pickup
    if (diffInHours < 12) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Pickup can only be rescheduled at least 12 hours before pickup time",
      });
    }

    // Optional: validate new slot exists & active
    const slotCheck = await client.query(
      `SELECT id FROM time_slots WHERE id = $1 AND is_active = TRUE`,
      [pickup_slot_id]
    );

    if (slotCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Invalid or inactive pickup slot",
      });
    }

    // ✅ Update pickup
    await client.query(
      `
      UPDATE orders
      SET pickup_date = $1,
          pickup_slot_id = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [pickup_date, pickup_slot_id, order_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Pickup rescheduled successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const rescheduleOrderDelivery = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const { delivery_date, delivery_slot_id } = req.body;
    const order_id = req.params.id;
    const user_id = req.user.id;

    if (!delivery_date || !delivery_slot_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "delivery_date and delivery_slot_id are required",
      });
    }

    // 🔒 Lock order + validate status + payment
    const orderCheck = await client.query(
      `
      SELECT o.pickup_date,
             ps.start_time AS pickup_start_time,
             o.delivery_date,
             ds.start_time AS current_delivery_start_time,
             st.delivery_hours
      FROM orders o
      JOIN time_slots ps ON o.pickup_slot_id = ps.id
      JOIN time_slots ds ON o.delivery_slot_id = ds.id
      JOIN service_types st ON o.service_type_id = st.id
      JOIN payments p ON p.order_id = o.id
      WHERE o.id = $1
        AND o.user_id = $2
        AND o.status = 'created'
        AND p.payment_type = 'advance'
        AND p.status = 'success'
      FOR UPDATE
      `,
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Order cannot be rescheduled. Invalid status or advance payment not completed.",
      });
    }

    const {
      pickup_date,
      pickup_start_time,
      delivery_date: old_delivery_date,
      current_delivery_start_time,
      delivery_hours,
    } = orderCheck.rows[0];

    // 🔹 Construct pickup datetime
    const pickupDateStr =
      typeof pickup_date === "string"
        ? pickup_date
        : pickup_date.toISOString().split("T")[0];

    const pickupDateTime = new Date(
      `${pickupDateStr}T${pickup_start_time}`
    );

    // 🔹 Fetch new delivery slot
    const slotCheck = await client.query(
      `SELECT start_time FROM time_slots 
       WHERE id = $1 AND is_active = TRUE`,
      [delivery_slot_id]
    );

    if (slotCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Invalid or inactive delivery slot",
      });
    }

    const new_delivery_start_time = slotCheck.rows[0].start_time;

    const newDeliveryDateTime = new Date(
      `${delivery_date}T${new_delivery_start_time}`
    );

    // ✅ Rule 1: Delivery must be after pickup
    if (newDeliveryDateTime <= pickupDateTime) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Delivery must be after pickup time",
      });
    }

    // ✅ Rule 2: Must respect delivery_hours (CMS controlled)
    const minDeliveryTime =
      pickupDateTime.getTime() +
      Number(delivery_hours) * 60 * 60 * 1000;

    if (newDeliveryDateTime.getTime() < minDeliveryTime) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Delivery must be at least ${delivery_hours} hours after pickup`,
      });
    }

    // ✅ Rule 3: Cannot reschedule within 12 hrs of current delivery
    const oldDeliveryDateStr =
      typeof old_delivery_date === "string"
        ? old_delivery_date
        : old_delivery_date.toISOString().split("T")[0];

    const oldDeliveryDateTime = new Date(
      `${oldDeliveryDateStr}T${current_delivery_start_time}`
    );

    const now = new Date();
    const diffInHours =
      (oldDeliveryDateTime.getTime() - now.getTime()) /
      (1000 * 60 * 60);

    if (diffInHours < 12) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Delivery can only be rescheduled at least 12 hours before delivery time",
      });
    }

    // ✅ Update delivery
    await client.query(
      `
      UPDATE orders
      SET delivery_date = $1,
          delivery_slot_id = $2,
          updated_at = NOW()
      WHERE id = $3
      `,
      [delivery_date, delivery_slot_id, order_id]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Delivery rescheduled successfully",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const cancelService = async (req, res, next) => {
  console.log("IN");
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;
    const { reason_type, reason_description } = req.body;

    const allowedReasons = [
      "pickup_schedule_issue",
      "modify_order",
      "service_charge_incorrect",
      "changed_mind",
      "other",
    ];

    // ✅ Validate reason
    if (!allowedReasons.includes(reason_type)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid cancellation reason" });
    }

    if (reason_type === "other" && !reason_description) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Please provide description" });
    }

    // 🔒 Lock order + get pickup datetime (DB handles date + time safely)
    const orderCheck = await client.query(
      `SELECT 
          (o.pickup_date + ts.start_time) AS pickup_datetime
       FROM orders o
       JOIN time_slots ts ON o.pickup_slot_id = ts.id
       WHERE o.id = $1
       AND o.user_id = $2
       AND o.status = 'created'
       FOR UPDATE`,
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Order cannot be cancelled",
      });
    }

    const pickupDateTime = new Date(orderCheck.rows[0].pickup_datetime);
    const now = new Date();

    const diffInHours =
      (pickupDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // ⛔ 12 hour rule
    if (diffInHours < 12) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Order can only be cancelled 12 hours before pickup",
      });
    }

    // ✅ Update order status
    await client.query(
      `UPDATE orders
       SET status = 'cancelled',
           updated_at = NOW()
       WHERE id = $1`,
      [order_id]
    );

    // ✅ Insert cancellation record
    await client.query(
      `INSERT INTO order_cancellations
       (order_id, user_id, reason_type, reason_description)
       VALUES ($1, $2, $3, $4)`,
      [order_id, user_id, reason_type, reason_description || null]
    );

    // 🎁 Give ₹500 cancellation coupon
    const couponResult = await client.query(
      `SELECT id FROM coupons
       WHERE coupon_code = 'CANCEL500'
       AND is_active = true`
    );

    if (couponResult.rows.length > 0) {
      const coupon_id = couponResult.rows[0].id;

      // 🔒 Prevent multiple active unused coupons
      const existingCoupon = await client.query(
        `SELECT id FROM coupon_usages
         WHERE coupon_id = $1
         AND user_id = $2
         AND is_used = FALSE
         AND expiry_date >= CURRENT_TIMESTAMP`,
        [coupon_id, user_id]
      );

      if (existingCoupon.rows.length === 0) {
        await client.query(
          `INSERT INTO coupon_usages
           (coupon_id, user_id, is_used, expiry_date)
           VALUES ($1, $2, FALSE, NOW() + INTERVAL '30 days')`,
          [coupon_id, user_id]
        );
      }
    }

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Order cancelled successfully. ₹500 coupon added.",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

