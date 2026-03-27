import sql from "../../config/db.js";
import { calculateOrderPricing } from "../../utils/price.util.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";

export const createDraftOrderService = async ({
  user_id,
  service_id,
  clothes_count,
}) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    if (!clothes_count || clothes_count < 10) {
      throw { status: 400, message: "Minimum 10 clothes required" };
    }

    const addressResult = await client.query(
      `SELECT id FROM user_address_details WHERE user_id = $1 AND is_selected = true LIMIT 1`,
      [user_id],
    );
    const addressId = addressResult.rows[0]?.id;
    if (!addressId)
      throw { status: 400, message: "Please select a delivery address" };

    const min_weight = Math.round(clothes_count * 0.4 * 2) / 2;
    const max_weight = Math.round(clothes_count * 0.7 * 2) / 2;

    const existingDraft = await client.query(
      `SELECT id FROM orders WHERE user_id = $1 AND status = 'draft' LIMIT 1`,
      [user_id],
    );

    let orderId;
    if (existingDraft.rows.length > 0) {
      const updateResult = await client.query(
        `UPDATE orders SET service_id=$1, clothes_count=$2, estimated_weight_min=$3,
         estimated_weight_max=$4, address_id=$5, updated_at=NOW()
         WHERE id=$6 RETURNING id`,
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
      const insertResult = await client.query(
        `INSERT INTO orders (user_id, service_id, clothes_count, estimated_weight_min,
         estimated_weight_max, address_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,'draft') RETURNING id`,
        [user_id, service_id, clothes_count, min_weight, max_weight, addressId],
      );
      orderId = insertResult.rows[0].id;
    }

    await client.query("COMMIT");
    return {
      order_id: orderId,
      estimated_weight_min: min_weight,
      estimated_weight_max: max_weight,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateServiceTypeService = async ({
  order_id,
  user_id,
  service_type_id,
}) => {
  if (!service_type_id)
    throw { status: 400, message: "service_type_id is required" };

  const result = await sql.query(
    `UPDATE orders SET service_type_id=$1, updated_at=NOW()
     WHERE id=$2 AND user_id=$3 AND status='draft' RETURNING id`,
    [service_type_id, order_id, user_id],
  );

  if (result.rows.length === 0)
    throw {
      status: 404,
      message: "Draft order not found or cannot be updated",
    };
  return result.rows[0].id;
};

export const updatePickupService = async ({
  order_id,
  user_id,
  pickup_date,
  pickup_slot_id,
}) => {
  if (!pickup_date || !pickup_slot_id)
    throw {
      status: 400,
      message: "pickup_date and pickup_slot_id are required",
    };
  if (isNaN(new Date(pickup_date).getTime()))
    throw { status: 400, message: "Invalid pickup date" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(pickup_date);
  selectedDate.setHours(0, 0, 0, 0);
  if (selectedDate <= today)
    throw { status: 400, message: "Pickup date must be a future date" };

  const slot = await sql.query(
    `SELECT id FROM time_slots WHERE id=$1 AND is_active=TRUE`,
    [pickup_slot_id],
  );
  if (slot.rows.length === 0)
    throw { status: 400, message: "Invalid or inactive time slot" };

  const result = await sql.query(
    `UPDATE orders SET pickup_date=$1, pickup_slot_id=$2, updated_at=NOW()
     WHERE id=$3 AND user_id=$4 AND status='draft' RETURNING id`,
    [pickup_date, pickup_slot_id, order_id, user_id],
  );

  if (result.rows.length === 0)
    throw { status: 404, message: "Draft order not found" };
  return result.rows[0].id;
};

export const updateDeliveryService = async ({
  order_id,
  user_id,
  delivery_date,
  delivery_slot_id,
}) => {
  if (!delivery_date || !delivery_slot_id)
    throw {
      status: 400,
      message: "delivery_date and delivery_slot_id are required",
    };

  const orderCheck = await sql.query(
    `SELECT o.pickup_date, ps.start_time AS pickup_start_time, st.delivery_hours
     FROM orders o
     JOIN time_slots ps ON o.pickup_slot_id = ps.id
     JOIN service_types st ON o.service_type_id = st.id
     WHERE o.id=$1 AND o.user_id=$2 AND o.status='draft'`,
    [order_id, user_id],
  );
  if (orderCheck.rows.length === 0)
    throw {
      status: 404,
      message: "Draft order not found or pickup not selected",
    };

  const { pickup_date, pickup_start_time, delivery_hours } = orderCheck.rows[0];
  const pickupDateStr =
    typeof pickup_date === "string"
      ? pickup_date
      : pickup_date.toLocaleDateString("en-CA");
  const pickupDateTime = new Date(`${pickupDateStr}T${pickup_start_time}`);

  const deliverySlot = await sql.query(
    `SELECT start_time FROM time_slots WHERE id=$1 AND is_active=TRUE`,
    [delivery_slot_id],
  );
  if (deliverySlot.rows.length === 0)
    throw { status: 400, message: "Invalid or inactive delivery time slot" };

  const deliveryDateTime = new Date(
    `${delivery_date}T${deliverySlot.rows[0].start_time}`,
  );
  const minDeliveryTime =
    pickupDateTime.getTime() + delivery_hours * 60 * 60 * 1000;

  if (deliveryDateTime.getTime() < minDeliveryTime) {
    throw {
      status: 400,
      message: `Delivery must be at least ${delivery_hours} hours after pickup`,
      pickup_date: pickupDateStr,
      minimum_allowed_delivery_date: new Date(
        minDeliveryTime,
      ).toLocaleDateString("en-CA"),
    };
  }

  await sql.query(
    `UPDATE orders SET delivery_date=$1, delivery_slot_id=$2, updated_at=NOW()
     WHERE id=$3 AND user_id=$4 AND status='draft'`,
    [delivery_date, delivery_slot_id, order_id, user_id],
  );
};

export const finalizeOrderService = async ({ order_id, user_id }) => {
  const orderResult = await sql.query(
    `SELECT o.*, s.base_price_per_kg, st.extra_price_per_kg, st.flat_fee,
            ts.is_peak, ts.peak_extra_charge
     FROM orders o
     JOIN services s ON o.service_id = s.id
     JOIN service_types st ON o.service_type_id = st.id
     LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
     WHERE o.id=$1 AND o.user_id=$2 AND o.status='draft'`,
    [order_id, user_id],
  );

  if (orderResult.rows.length === 0)
    throw { status: 404, message: "Draft order not found" };

  const order = orderResult.rows[0];
  if (
    !order.service_type_id ||
    !order.pickup_date ||
    !order.delivery_date ||
    !order.address_id
  ) {
    throw {
      status: 400,
      message: "Please complete all steps before finalizing",
    };
  }

  const avg_weight =
    (Number(order.estimated_weight_min) + Number(order.estimated_weight_max)) /
    2;
  const peak_charge = order.is_peak ? Number(order.peak_extra_charge) : 0;
  const estimated_total =
    avg_weight * Number(order.base_price_per_kg) +
    avg_weight * Number(order.extra_price_per_kg) +
    Number(order.flat_fee) +
    peak_charge;

  await sql.query(
    `UPDATE orders SET base_price_per_kg=$1, extra_price_per_kg=$2, flat_fee=$3,
     peak_extra_charge=$4, estimated_total=$5, status='booked', updated_at=NOW()
     WHERE id=$6`,
    [
      order.base_price_per_kg,
      order.extra_price_per_kg,
      order.flat_fee,
      peak_charge,
      estimated_total,
      order_id,
    ],
  );

  return estimated_total;
};

export const reviewOrderService = async ({ order_id, user_id }) => {
  const result = await sql.query(
    `SELECT o.*, s.name AS service_name, s.base_price_per_kg,
            st.name AS service_type_name, st.extra_price_per_kg, st.flat_fee,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            ua.complete_address AS full_address,
            ts.is_peak, ts.peak_extra_charge,
            c.id AS coupon_id, c.coupon_code, c.discount_type, c.discount_value, c.minimum_amount_value
     FROM orders o
     JOIN services s ON o.service_id = s.id
     JOIN service_types st ON o.service_type_id = st.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id = pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id = delivery_slot.id
     LEFT JOIN user_address_details ua ON o.address_id = ua.id
     LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
     LEFT JOIN coupons c ON o.applied_coupon_id = c.id
     WHERE o.id=$1 AND o.user_id=$2 AND o.status='booked'`,
    [order_id, user_id],
  );

  if (result.rows.length === 0)
    throw { status: 404, message: "Created order not found" };

  const order = result.rows[0];
  const pricing = calculateOrderPricing(order);
  return { order, pricing };
};

export const applyCouponService = async ({
  order_id,
  user_id,
  coupon_code,
}) => {
  if (!coupon_code) throw { status: 400, message: "Coupon code is required" };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT id, applied_coupon_id FROM orders WHERE id=$1 AND user_id=$2 AND status='booked' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderResult.rows.length === 0)
      throw { status: 404, message: "Order not found" };

    const couponResult = await client.query(
      `SELECT * FROM coupons WHERE UPPER(coupon_code)=UPPER($1) AND is_active=true
       AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP`,
      [coupon_code],
    );
    if (couponResult.rows.length === 0)
      throw { status: 400, message: "Invalid or expired coupon" };

    const coupon = couponResult.rows[0];

    if (coupon.coupon_code === "CANCEL500") {
      const eligibilityCheck = await client.query(
        `SELECT id FROM coupon_usages WHERE coupon_id=$1 AND user_id=$2 AND is_used=FALSE AND expiry_date >= CURRENT_TIMESTAMP`,
        [coupon.id, user_id],
      );
      if (eligibilityCheck.rows.length === 0)
        throw {
          status: 400,
          message: "You are not eligible to use this coupon",
        };
    }

    if (
      coupon.usage_limit !== null &&
      coupon.used_count >= coupon.usage_limit
    ) {
      throw { status: 400, message: "Coupon usage limit exceeded" };
    }

    if (coupon.per_user_limit !== null) {
      const usageCheck = await client.query(
        `SELECT COUNT(*) FROM coupon_usages WHERE coupon_id=$1 AND user_id=$2 AND is_used=TRUE`,
        [coupon.id, user_id],
      );
      if (Number(usageCheck.rows[0].count) >= coupon.per_user_limit) {
        throw { status: 400, message: "You have already used this coupon" };
      }
    }

    await client.query(`UPDATE orders SET applied_coupon_id=$1 WHERE id=$2`, [
      coupon.id,
      order_id,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const removeCouponService = async ({ order_id, user_id }) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT applied_coupon_id FROM orders WHERE id=$1 AND user_id=$2 AND status='booked' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderResult.rows.length === 0)
      throw { status: 404, message: "Order not found" };
    if (!orderResult.rows[0].applied_coupon_id)
      throw { status: 400, message: "No coupon applied to this order" };

    await client.query(`UPDATE orders SET applied_coupon_id=NULL WHERE id=$1`, [
      order_id,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getUserOrdersService = async ({
  user_id,
  page,
  limit,
  status,
  time,
}) => {
  const offset = (page - 1) * limit;
  let whereConditions = [`o.user_id = $1`];
  let values = [user_id];
  let paramIndex = 2;

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

  if (time && time !== "anytime") {
    const intervalMap = {
      last_7_days: "7 days",
      last_30_days: "30 days",
      last_6_months: "6 months",
      last_year: "1 year",
    };
    if (intervalMap[time]) {
      whereConditions.push(
        `o.created_at >= NOW() - INTERVAL '${intervalMap[time]}'`,
      );
    }
  }

  const whereClause = whereConditions.join(" AND ");

  const countResult = await sql.query(
    `SELECT COUNT(*) FROM orders o
     JOIN payments p ON p.order_id=o.id AND p.payment_type='advance' AND p.status='success'
     WHERE ${whereClause}`,
    values,
  );

  const result = await sql.query(
    `SELECT o.id, o.clothes_count, o.estimated_weight_min, o.estimated_weight_max,
            s.name AS service_name, s.image AS service_image,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
            p.amount AS advance_amount, p.payment_method
     FROM orders o
     JOIN payments p ON p.order_id=o.id AND p.payment_type='advance' AND p.status='success'
     JOIN services s ON o.service_id=s.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id=pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id=delivery_slot.id
     WHERE ${whereClause}
     ORDER BY o.created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, limit, offset],
  );

  return { rows: result.rows, total: parseInt(countResult.rows[0].count) };
};

export const reschedulePickupService = async ({
  order_id,
  user_id,
  pickup_date,
  pickup_slot_id,
}) => {
  if (!pickup_date || !pickup_slot_id)
    throw { status: 400, message: "Pickup date and slot are required" };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const orderCheck = await client.query(
      `SELECT o.pickup_date, ts.start_time FROM orders o
       JOIN time_slots ts ON o.pickup_slot_id=ts.id
       JOIN payments p ON p.order_id=o.id
       WHERE o.id=$1 AND o.user_id=$2 AND o.status='booked'
         AND p.payment_type='advance' AND p.status='success' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderCheck.rows.length === 0)
      throw {
        status: 400,
        message:
          "Order cannot be rescheduled. Either status invalid or advance payment not completed.",
      };

    const order = orderCheck.rows[0];
    const pickupDateTime = new Date(
      `${order.pickup_date.toISOString().split("T")[0]}T${order.start_time}`,
    );
    const diffInHours = (pickupDateTime - new Date()) / (1000 * 60 * 60);
    if (diffInHours < 12)
      throw {
        status: 400,
        message:
          "Pickup can only be rescheduled at least 12 hours before pickup time",
      };

    const slotCheck = await client.query(
      `SELECT id FROM time_slots WHERE id=$1 AND is_active=TRUE`,
      [pickup_slot_id],
    );
    if (slotCheck.rows.length === 0)
      throw { status: 400, message: "Invalid or inactive pickup slot" };

    await client.query(
      `UPDATE orders SET pickup_date=$1, pickup_slot_id=$2, updated_at=NOW() WHERE id=$3`,
      [pickup_date, pickup_slot_id, order_id],
    );

    await client.query("COMMIT");

    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Pickup Rescheduled',
      message: `Your pickup for order #${order_id} has been rescheduled to ${pickup_date}. We will send a rider at your selected slot.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const rescheduleDeliveryService = async ({
  order_id,
  user_id,
  delivery_date,
  delivery_slot_id,
}) => {
  if (!delivery_date || !delivery_slot_id)
    throw {
      status: 400,
      message: "delivery_date and delivery_slot_id are required",
    };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const orderCheck = await client.query(
      `SELECT o.pickup_date, ps.start_time AS pickup_start_time, o.delivery_date,
              ds.start_time AS current_delivery_start_time, st.delivery_hours
       FROM orders o
       JOIN time_slots ps ON o.pickup_slot_id=ps.id
       JOIN time_slots ds ON o.delivery_slot_id=ds.id
       JOIN service_types st ON o.service_type_id=st.id
       JOIN payments p ON p.order_id=o.id
       WHERE o.id=$1 AND o.user_id=$2 AND o.status='booked'
         AND p.payment_type='advance' AND p.status='success' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderCheck.rows.length === 0)
      throw {
        status: 400,
        message:
          "Order cannot be rescheduled. Invalid status or advance payment not completed.",
      };

    const {
      pickup_date,
      pickup_start_time,
      delivery_date: old_delivery_date,
      current_delivery_start_time,
      delivery_hours,
    } = orderCheck.rows[0];

    const pickupDateStr =
      typeof pickup_date === "string"
        ? pickup_date
        : pickup_date.toISOString().split("T")[0];
    const pickupDateTime = new Date(`${pickupDateStr}T${pickup_start_time}`);

    const slotCheck = await client.query(
      `SELECT start_time FROM time_slots WHERE id=$1 AND is_active=TRUE`,
      [delivery_slot_id],
    );
    if (slotCheck.rows.length === 0)
      throw { status: 400, message: "Invalid or inactive delivery slot" };

    const newDeliveryDateTime = new Date(
      `${delivery_date}T${slotCheck.rows[0].start_time}`,
    );

    if (newDeliveryDateTime <= pickupDateTime)
      throw { status: 400, message: "Delivery must be after pickup time" };

    const minDeliveryTime =
      pickupDateTime.getTime() + Number(delivery_hours) * 60 * 60 * 1000;
    if (newDeliveryDateTime.getTime() < minDeliveryTime)
      throw {
        status: 400,
        message: `Delivery must be at least ${delivery_hours} hours after pickup`,
      };

    const oldDeliveryDateStr =
      typeof old_delivery_date === "string"
        ? old_delivery_date
        : old_delivery_date.toISOString().split("T")[0];
    const oldDeliveryDateTime = new Date(
      `${oldDeliveryDateStr}T${current_delivery_start_time}`,
    );
    const diffInHours =
      (oldDeliveryDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
    if (diffInHours < 12)
      throw {
        status: 400,
        message:
          "Delivery can only be rescheduled at least 12 hours before delivery time",
      };

    await client.query(
      `UPDATE orders SET delivery_date=$1, delivery_slot_id=$2, updated_at=NOW() WHERE id=$3`,
      [delivery_date, delivery_slot_id, order_id],
    );

    await client.query("COMMIT");

    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Delivery Rescheduled',
      message: `Your delivery for order #${order_id} has been rescheduled to ${delivery_date}.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const cancelServiceService = async ({
  order_id,
  user_id,
  reason_type,
  reason_description,
}) => {
  const allowedReasons = [
    "pickup_schedule_issue",
    "modify_order",
    "service_charge_incorrect",
    "changed_mind",
    "other",
  ];
  if (!allowedReasons.includes(reason_type))
    throw { status: 400, message: "Invalid cancellation reason" };
  if (reason_type === "other" && !reason_description)
    throw { status: 400, message: "Please provide description" };

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const orderCheck = await client.query(
      `SELECT (o.pickup_date + ts.start_time) AS pickup_datetime
       FROM orders o JOIN time_slots ts ON o.pickup_slot_id=ts.id
       WHERE o.id=$1 AND o.user_id=$2 AND o.status='booked' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderCheck.rows.length === 0)
      throw { status: 400, message: "Order cannot be cancelled" };

    const diffInHours =
      (new Date(orderCheck.rows[0].pickup_datetime) - new Date()) /
      (1000 * 60 * 60);
    if (diffInHours < 12)
      throw {
        status: 400,
        message: "Order can only be cancelled 12 hours before pickup",
      };

    await client.query(
      `UPDATE orders SET status='cancelled', updated_at=NOW() WHERE id=$1`,
      [order_id],
    );
    await client.query(
      `INSERT INTO order_cancellations (order_id, user_id, reason_type, reason_description) VALUES ($1,$2,$3,$4)`,
      [order_id, user_id, reason_type, reason_description || null],
    );

    const couponResult = await client.query(
      `SELECT id FROM coupons WHERE coupon_code='CANCEL500' AND is_active=true`,
    );
    if (couponResult.rows.length > 0) {
      const coupon_id = couponResult.rows[0].id;
      const existingCoupon = await client.query(
        `SELECT id FROM coupon_usages WHERE coupon_id=$1 AND user_id=$2 AND is_used=FALSE AND expiry_date >= CURRENT_TIMESTAMP`,
        [coupon_id, user_id],
      );
      if (existingCoupon.rows.length === 0) {
        await client.query(
          `INSERT INTO coupon_usages (coupon_id, user_id, is_used, expiry_date) VALUES ($1,$2,FALSE,NOW() + INTERVAL '30 days')`,
          [coupon_id, user_id],
        );
      }
    }

    await client.query("COMMIT");

    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Order Cancelled',
      message: `Your order #${order_id} has been cancelled. A ₹500 coupon has been added to your account.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reportOrderIssueService = async ({
  user_id,
  order_id,
  issue_type,
  issue_reason,
  description,
}) => {
  if (!order_id || !issue_type || !issue_reason)
    throw {
      status: 400,
      message: "order_id, issue_type and issue_reason are required",
    };

  const { rows: orderRows } = await sql.query(
    `SELECT id FROM orders WHERE id=$1 AND user_id=$2 AND payment_status='partially_paid'`,
    [order_id, user_id],
  );
  if (orderRows.length === 0)
    throw { status: 404, message: "Order not found or does not belong to you" };

  const { rows: existingReport } = await sql.query(
    `SELECT id FROM order_reports WHERE order_id=$1 AND user_id=$2 AND status='open'`,
    [order_id, user_id],
  );
  if (existingReport.length > 0)
    throw { status: 400, message: "You have already reported this order" };

  const { rows } = await sql.query(
    `INSERT INTO order_reports (order_id, user_id, issue_type, issue_reason, description)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [order_id, user_id, issue_type, issue_reason, description || null],
  );

  return rows[0];
};
