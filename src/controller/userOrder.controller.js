
import sql from "../config/db.js";

export const createDraftOrder = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query('BEGIN');

    const { service_id, clothes_count } = req.body;
    const user_id = req.user.id;

    // ✅ Validate clothes count
    if (!clothes_count || clothes_count < 10) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: "Minimum 10 clothes required"
      });
    }

    // ✅ Get selected address ID from separate table
    const addressResult = await client.query(
      `SELECT id
       FROM user_address_details
       WHERE user_id = $1 AND is_selected = true
       LIMIT 1`,
      [user_id]
    );

    const addressId = addressResult.rows[0]?.id;

    if (!addressId) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: "Please select a delivery address"
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
      [user_id]
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
          existingDraft.rows[0].id
        ]
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
        [
          user_id,
          service_id,
          clothes_count,
          min_weight,
          max_weight,
          addressId
        ]
      );

      orderId = insertResult.rows[0].id;
    }

    await client.query('COMMIT');

    return res.status(200).json({
      order_id: orderId,
      estimated_weight_min: min_weight,
      estimated_weight_max: max_weight ,
      message: "Order created successfully"
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const updateServiceType = async (req, res, next) => {
  try {
    const { service_type_id } = req.body;
    console.log("Received service_type_id:", service_type_id);
    const order_id = req.params.id;
    const user_id = req.user.id;

    if (!service_type_id) {
      return res.status(400).json({
        message: "service_type_id is required"
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
      [service_type_id, order_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found or cannot be updated"
      });
    }

    return res.status(200).json({
      order_id: result.rows[0].id,
      message: "Service type updated successfully"
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
        message: "pickup_date and pickup_slot_id are required"
      });
    }

    // ✅ Validate date format (basic check)
    if (isNaN(new Date(pickup_date).getTime())) {
      return res.status(400).json({
        message: "Invalid pickup date"
      });
    }

    // ✅ Check if slot exists & active
    const slot = await sql.query(
      `SELECT id FROM time_slots
       WHERE id = $1 AND is_active = TRUE`,
      [pickup_slot_id]
    );

    if (slot.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or inactive time slot"
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
      [pickup_date, pickup_slot_id, order_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found"
      });
    }

    return res.status(200).json({
      message: "Pickup details updated successfully",
      order_id: result.rows[0].id,
      pickup_date,
      pickup_slot_id
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
        message: "delivery_date and delivery_slot_id are required"
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
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found or pickup not selected"
      });
    }

    const { pickup_date, pickup_start_time, delivery_hours } =
      orderCheck.rows[0];

    const pickupDateStr =
      typeof pickup_date === "string"
        ? pickup_date
        : pickup_date.toLocaleDateString("en-CA");

    const pickupDateTime = new Date(
      `${pickupDateStr}T${pickup_start_time}`
    );

    // 🔹 Fetch delivery slot
    const deliverySlot = await sql.query(
      `SELECT start_time
       FROM time_slots
       WHERE id = $1 AND is_active = TRUE`,
      [delivery_slot_id]
    );

    if (deliverySlot.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or inactive delivery time slot"
      });
    }

    const delivery_start_time = deliverySlot.rows[0].start_time;

    const deliveryDateTime = new Date(
      `${delivery_date}T${delivery_start_time}`
    );

    const minDeliveryTime =
      pickupDateTime.getTime() +
      (delivery_hours * 60 * 60 * 1000);

    if (deliveryDateTime.getTime() < minDeliveryTime) {
      const minDate = new Date(minDeliveryTime)
        .toLocaleDateString("en-CA");

      return res.status(400).json({
        message: `Delivery must be at least ${delivery_hours} hours after pickup`,
        pickup_date: pickupDateStr,
        minimum_allowed_delivery_date: minDate
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
      [delivery_date, delivery_slot_id, order_id, user_id]
    );

    return res.status(200).json({
      message: "Delivery details updated successfully",
      order_id: order_id,
      delivery_date,
      delivery_slot_id
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
      [order_id, user_id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        message: "Draft order not found"
      });
    }

    const order = orderResult.rows[0];

    if (!order.service_type_id ||
        !order.pickup_date ||
        !order.delivery_date ||
        !order.address_id) {
      return res.status(400).json({
        message: "Please complete all steps before finalizing"
      });
    }

    const avg_weight =
      (Number(order.estimated_weight_min) +
       Number(order.estimated_weight_max)) / 2;

    const base =
      avg_weight * Number(order.base_price_per_kg);

    const type_extra =
      avg_weight * Number(order.extra_price_per_kg);

    const flat_fee =
      Number(order.flat_fee);

    const peak_charge =
      order.is_peak ? Number(order.peak_extra_charge) : 0;

    const estimated_total =
      base + type_extra + flat_fee + peak_charge;

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
        order_id
      ]
    );

    return res.status(200).json({
      message: "Order finalized successfully",
      order_id,
      estimated_total: estimated_total.toFixed(2)
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
          ts.peak_extra_charge

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

       WHERE o.id = $1
         AND o.user_id = $2
         AND o.status = 'created'`,
      [order_id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Created order not found" });
    }

    const order = result.rows[0];

    const avg_weight =
      (Number(order.estimated_weight_min) +
       Number(order.estimated_weight_max)) / 2;

    const service_charge =
      avg_weight * Number(order.base_price_per_kg);

    const type_extra =
      avg_weight * Number(order.extra_price_per_kg);

    const flat_fee = Number(order.flat_fee);

    const peak_charge =
      order.is_peak ? Number(order.peak_extra_charge) : 0;

    const gross_total =
      service_charge + type_extra + flat_fee + peak_charge;

    const discount = 0;
    const final_total = gross_total - discount;

    const advance_payment = 500;
    const remaining_payment = final_total - advance_payment;

    return res.status(200).json({
      order_id,

      service_details: {
        service_name: order.service_name,
        service_type: order.service_type_name,
        clothes_count: order.clothes_count,
        estimated_weight_range:
          `${order.estimated_weight_min} - ${order.estimated_weight_max} kg`
      },

      schedule: {
        pickup: {
          date: order.pickup_date,
          slot: `${order.pickup_start} - ${order.pickup_end}`
        },
        delivery: {
          date: order.delivery_date,
          slot: `${order.delivery_start} - ${order.delivery_end}`
        }
      },

      address: order.full_address,

      pricing_breakdown: {
        service_charge: service_charge.toFixed(2),
        peak_charge: peak_charge.toFixed(2),
        discount: discount.toFixed(2),
        advance_payment: advance_payment.toFixed(2),
        remaining_payment:
          remaining_payment > 0
            ? remaining_payment.toFixed(2)
            : "0.00",
        total_payable_now: advance_payment.toFixed(2),
        approx_total: final_total.toFixed(2)
      }
    });

  } catch (error) {
    next(error);
  }
};














