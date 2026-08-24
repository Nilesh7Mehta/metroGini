import sql from "../../config/db.js";
import { fetchOrderTimestamps } from "../../utils/datetime.util.js";
import {
  applyCouponDiscount,
  calculateOrderPricing,
} from "../../utils/price.util.js";
import { getEstimatedWeightRangeFromClothesCount } from "../../utils/clothesWeight.util.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";
import { sendSmsToUserSafe } from "../common/sms.service.js";
import { sendUserEmailSafe, sendOrderCancelledEmail } from "../common/email.service.js";
import { assertPickupSlotAvailable } from "../common/timeSlotAvailability.service.js";
import { resolveBasePricePerKg } from "../common/serviceZonePrice.service.js";
import { assertPincodeServiceable } from "../common/pincode.service.js";
import { SMS_TEMPLATE_KEYS } from "../../utils/smsTemplates.js";
import { orderReceivedTemplate, formatOrderDisplayId } from "../../utils/userNotificationTemplates.js";

export const createDraftOrderService = async ({
  user_id,
  service_id,
  clothes_count,
}) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    if (!clothes_count || clothes_count < 10 || clothes_count > 25) {
      throw { status: 400, message: "Clothes count must be between 10 and 25" };
    }

    const addressResult = await client.query(
      `SELECT id, pincode FROM user_address_details WHERE user_id = $1 AND is_selected = true LIMIT 1`,
      [user_id],
    );
    const address = addressResult.rows[0];
    if (!address?.id)
      throw { status: 400, message: "Please select a delivery address" };

    await assertPincodeServiceable(address.pincode);
    const addressId = address.id;

    const { min: min_weight, max: max_weight } =
      getEstimatedWeightRangeFromClothesCount(clothes_count);

    const existingDraft = await client.query(
      `SELECT id FROM orders WHERE user_id = $1 AND status = 'draft' LIMIT 1`,
      [user_id],
    );

    const order_code = `MG${Math.floor(100000 + Math.random() * 900000)}`;

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
         estimated_weight_max, address_id, status, order_code)
         VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
        [user_id, service_id, clothes_count, min_weight, max_weight, addressId, order_code],
      );
      orderId = insertResult.rows[0].id;
    }

    await client.query("COMMIT");
    return {
      id: orderId,
      order_id : order_code,
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

  await assertPickupSlotAvailable(pickup_date, pickup_slot_id, order_id);

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

const MAX_INSTRUCTION_LENGTH = 500;

const normalizeInstruction = (value, fieldName) => {
  if (typeof value !== "string") {
    throw { status: 400, message: `${fieldName} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_INSTRUCTION_LENGTH) {
    throw {
      status: 400,
      message: `${fieldName} must be at most ${MAX_INSTRUCTION_LENGTH} characters`,
    };
  }
  return trimmed.length === 0 ? null : trimmed;
};

export const updateOrderInstructionsService = async ({
  order_id,
  user_id,
  pickup_special_instruction,
  delivery_special_instruction,
}) => {
  const hasPickup = pickup_special_instruction !== undefined;
  const hasDelivery = delivery_special_instruction !== undefined;

  if (!hasPickup && !hasDelivery) {
    throw { status: 400, message: "At least one instruction is required" };
  }

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (hasPickup) {
    setClauses.push(`pickup_special_instruction=$${paramIndex}`);
    values.push(
      normalizeInstruction(
        pickup_special_instruction,
        "pickup_special_instruction",
      ),
    );
    paramIndex++;
  }

  if (hasDelivery) {
    setClauses.push(`delivery_special_instruction=$${paramIndex}`);
    values.push(
      normalizeInstruction(
        delivery_special_instruction,
        "delivery_special_instruction",
      ),
    );
    paramIndex++;
  }

  setClauses.push("updated_at=NOW()");

  values.push(order_id, user_id);

  const result = await sql.query(
    `UPDATE orders
     SET ${setClauses.join(", ")}
     WHERE id=$${paramIndex} AND user_id=$${paramIndex + 1}
     RETURNING pickup_special_instruction, delivery_special_instruction`,
    values,
  );

  if (result.rows.length === 0) {
    throw {
      status: 404,
      message: "Order not found or instructions can no longer be updated",
    };
  }

  return result.rows[0];
};

export const finalizeOrderService = async ({ order_id, user_id }) => {
  const orderResult = await sql.query(
    `SELECT o.*, st.extra_price_per_kg, st.flat_fee,
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

  const addressPin = await sql.query(
    `SELECT pincode FROM user_address_details WHERE id = $1`,
    [order.address_id],
  );
  await assertPincodeServiceable(addressPin.rows[0]?.pincode);

  const base_price_per_kg = await resolveBasePricePerKg(sql, {
    serviceId: order.service_id,
    addressId: order.address_id,
  });
  const extra_price_per_kg = Number(order.extra_price_per_kg);
  const flat_fee = Number(order.flat_fee);

  const avg_weight =
    (Number(order.estimated_weight_min) + Number(order.estimated_weight_max)) /
    2;
  const peak_charge = order.is_peak ? Number(order.peak_extra_charge) : 0;
  const estimated_total =
    avg_weight * base_price_per_kg +
    avg_weight * extra_price_per_kg +
    flat_fee +
    peak_charge;

  await sql.query(
    `UPDATE orders SET base_price_per_kg=$1, extra_price_per_kg=$2, flat_fee=$3,
     peak_extra_charge=$4, estimated_total=$5, status='booked', booked_at=NOW(), updated_at=NOW()
     WHERE id=$6`,
    [
      base_price_per_kg,
      extra_price_per_kg,
      flat_fee,
      peak_charge,
      estimated_total,
      order_id,
    ],
  );

  const received = orderReceivedTemplate({ orderId: order_id });
  await createNotificationsBatch([
    {
      identity_id: user_id,
      role: "user",
      title: received.title,
      message: received.message,
      reference_type: "order",
      reference_id: order_id,
      data: received.data,
    },
  ]);

  sendSmsToUserSafe(user_id, SMS_TEMPLATE_KEYS.ORDER_RECEIVED, {}, {
    reference_type: "order",
    reference_id: order_id,
  });

  const timestamps = await fetchOrderTimestamps(sql, order_id);
  return {
    estimated_total,
    timestamps,
    booked_at: timestamps.booked_at,
  };
};

export const completeOrderService = async ({
  order_id,
  user_id,
  service_type_id,
  pickup_date,
  pickup_slot_id,
  next_delivery_date,
}) => {
  if (!service_type_id || !pickup_date || !pickup_slot_id || !next_delivery_date)
    throw {
      status: 400,
      message:
        "service_type_id, pickup_date, pickup_slot_id and next_delivery_date are required",
    };
  if (isNaN(new Date(pickup_date).getTime()))
    throw { status: 400, message: "Invalid pickup date" };
  if (isNaN(new Date(next_delivery_date).getTime()))
    throw { status: 400, message: "Invalid delivery date" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(pickup_date);
  selectedDate.setHours(0, 0, 0, 0);
  if (selectedDate <= today)
    throw { status: 400, message: "Pickup date must be a future date" };

  const selectedDeliveryDate = new Date(next_delivery_date);
  selectedDeliveryDate.setHours(0, 0, 0, 0);
  if (selectedDeliveryDate <= selectedDate)
    throw { status: 400, message: "Delivery date must be after pickup date" };

  const delivery_date = next_delivery_date;
  const delivery_slot_id = pickup_slot_id;

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const slotCheck = await client.query(
      `SELECT id, start_time, is_peak, peak_extra_charge
       FROM time_slots
       WHERE id=$1 AND is_active=TRUE`,
      [pickup_slot_id],
    );
    if (slotCheck.rows.length === 0)
      throw { status: 400, message: "Invalid or inactive time slot" };

    await assertPickupSlotAvailable(pickup_date, pickup_slot_id, order_id);

    const orderResult = await client.query(
      `SELECT o.id, o.service_id, o.address_id, o.estimated_weight_min, o.estimated_weight_max,
              st.extra_price_per_kg, st.flat_fee, st.delivery_hours
       FROM orders o
       JOIN services s ON o.service_id = s.id
       JOIN service_types st ON st.id = $3
       WHERE o.id=$1 AND o.user_id=$2 AND o.status='draft'
       FOR UPDATE`,
      [order_id, user_id, service_type_id],
    );

    if (orderResult.rows.length === 0)
      throw { status: 404, message: "Draft order not found or cannot be updated" };

    const order = orderResult.rows[0];

    if (!order.address_id) {
      throw {
        status: 400,
        message: "Please select a delivery address before completing order",
      };
    }

    const addressPin = await client.query(
      `SELECT pincode FROM user_address_details WHERE id = $1`,
      [order.address_id],
    );
    await assertPincodeServiceable(addressPin.rows[0]?.pincode);

    const pickupDateTime = new Date(
      `${pickup_date}T${slotCheck.rows[0].start_time}`,
    );
    // const deliveryDateTime = new Date(
    //   `${delivery_date}T${slotCheck.rows[0].start_time}`,
    // );
    const minDeliveryTime =
      pickupDateTime.getTime() + Number(order.delivery_hours) * 60 * 60 * 1000;

    // if (deliveryDateTime.getTime() < minDeliveryTime) {
    //   throw {
    //     status: 400,
    //     message: `Delivery must be at least ${order.delivery_hours} hours after pickup`,
    //   };
    // }

    const avg_weight =
      (Number(order.estimated_weight_min) + Number(order.estimated_weight_max)) /
      2;
    const peak_charge = slotCheck.rows[0].is_peak
      ? Number(slotCheck.rows[0].peak_extra_charge)
      : 0;

    const base_price_per_kg = await resolveBasePricePerKg(client, {
      serviceId: order.service_id,
      addressId: order.address_id,
    });
    const extra_price_per_kg = Number(order.extra_price_per_kg);
    const flat_fee = Number(order.flat_fee);

    const estimated_total =
      avg_weight * base_price_per_kg +
      avg_weight * extra_price_per_kg +
      flat_fee +
      peak_charge;

    await client.query(
      `UPDATE orders
       SET service_type_id=$1,
           pickup_date=$2,
           pickup_slot_id=$3,
           delivery_date=$4,
           delivery_slot_id=$5,
           base_price_per_kg=$6,
           extra_price_per_kg=$7,
           flat_fee=$8,
           peak_extra_charge=$9,
           estimated_total=$10,
           status='draft',
           booked_at=NOW(),
           updated_at=NOW()
       WHERE id=$11`,
      [
        service_type_id,
        pickup_date,
        pickup_slot_id,
        delivery_date,
        delivery_slot_id,
        base_price_per_kg,
        extra_price_per_kg,
        flat_fee,
        peak_charge,
        estimated_total,
        order_id,
      ],
    );

    await client.query("COMMIT");

    const timestamps = await fetchOrderTimestamps(sql, order_id);
    return {
      estimated_total,
      delivery_date,
      timestamps,
      booked_at: timestamps.booked_at,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reviewOrderService = async ({ order_id, user_id }) => {
  const result = await sql.query(
    `SELECT o.*, s.name AS service_name,
            st.name AS service_type_name, st.extra_price_per_kg, st.flat_fee,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            ua.complete_address AS full_address,
            ts.is_peak, ts.peak_extra_charge,
            c.id AS coupon_id, c.coupon_code, c.discount_type, c.discount_value,
            c.minimum_amount_value, c.maximum_amount_value
     FROM orders o
     JOIN services s ON o.service_id = s.id
     JOIN service_types st ON o.service_type_id = st.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id = pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id = delivery_slot.id
     LEFT JOIN user_address_details ua ON o.address_id = ua.id
     LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
     LEFT JOIN coupons c ON o.applied_coupon_id = c.id
     WHERE o.id=$1 AND o.user_id=$2 AND o.status='draft'`,
    [order_id, user_id],
  );

  if (result.rows.length === 0)
    throw { status: 404, message: "Created order not found" };

  const order = result.rows[0];
  if (order.base_price_per_kg == null) {
    order.base_price_per_kg = await resolveBasePricePerKg(sql, {
      serviceId: order.service_id,
      addressId: order.address_id,
    });
  }
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
      `SELECT o.id, o.service_id, o.address_id, o.applied_coupon_id,
              o.estimated_weight_min, o.estimated_weight_max,
              o.estimated_total,
              o.base_price_per_kg, o.extra_price_per_kg, o.flat_fee,
              o.peak_extra_charge,
              st.extra_price_per_kg AS service_type_extra_price_per_kg,
              st.flat_fee AS service_type_flat_fee,
              ts.is_peak AS slot_is_peak,
              ts.peak_extra_charge AS slot_peak_extra_charge
       FROM orders o
       LEFT JOIN service_types st ON o.service_type_id = st.id
       LEFT JOIN time_slots ts ON o.pickup_slot_id = ts.id
       WHERE o.id=$1 AND o.user_id=$2 AND o.status='draft'
       FOR UPDATE OF o`,
      [order_id, user_id],
    );
    if (orderResult.rows.length === 0)
      throw { status: 404, message: "Order not found" };

    const orderRow = orderResult.rows[0];

    const resolvedBasePrice =
      orderRow.base_price_per_kg != null
        ? Number(orderRow.base_price_per_kg)
        : await resolveBasePricePerKg(client, {
            serviceId: orderRow.service_id,
            addressId: orderRow.address_id,
          });

    const pricingOrder = {
      estimated_weight_min: orderRow.estimated_weight_min,
      estimated_weight_max: orderRow.estimated_weight_max,
      base_price_per_kg: resolvedBasePrice,
      extra_price_per_kg:
        orderRow.extra_price_per_kg ?? orderRow.service_type_extra_price_per_kg,
      flat_fee: orderRow.flat_fee ?? orderRow.service_type_flat_fee,
      is_peak: orderRow.slot_is_peak,
      peak_extra_charge:
        orderRow.peak_extra_charge ?? orderRow.slot_peak_extra_charge,
    };

    const { gross_total: calculatedAmount } =
      calculateOrderPricing(pricingOrder);

    const orderAmount =
      orderRow.estimated_total != null
        ? Number(orderRow.estimated_total)
        : calculatedAmount;

    if (!orderAmount || Number.isNaN(orderAmount) || orderAmount <= 0) {
      throw {
        status: 400,
        message:
          "Complete service type and pickup details before applying a coupon",
      };
    }

    const couponResult = await client.query(
      `SELECT * FROM coupons WHERE UPPER(coupon_code)=UPPER($1) AND is_active=true
       AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP`,
      [coupon_code],
    );
    if (couponResult.rows.length === 0)
      throw { status: 400, message: "Invalid or expired coupon" };

    const coupon = couponResult.rows[0];

    const minAmount = Number(coupon.minimum_amount_value || 0);
    if (orderAmount < minAmount) {
      throw {
        status: 400,
        message: `Coupon requires a minimum order amount of ₹${minAmount}`,
      };
    }

    if (
      coupon.maximum_amount_value != null &&
      orderAmount > Number(coupon.maximum_amount_value)
    ) {
      throw {
        status: 400,
        message: `Coupon is valid only for orders up to ₹${Number(coupon.maximum_amount_value)}`,
      };
    }

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

    const { discount, net_total } = applyCouponDiscount(orderAmount, {
      applied_coupon_id: coupon.id,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      minimum_amount_value: coupon.minimum_amount_value,
      maximum_amount_value: coupon.maximum_amount_value,
    });

    await client.query(
      `UPDATE orders
       SET applied_coupon_id=$1,
           discount_price=$2,
           updated_at=NOW()
       WHERE id=$3`,
      [coupon.id, discount, order_id],
    );
    await client.query("COMMIT");

    return {
      discount_price: discount,
      discount,
      approx_total: net_total,
    };
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
      `SELECT applied_coupon_id FROM orders WHERE id=$1 AND user_id=$2 AND status='draft' FOR UPDATE`,
      [order_id, user_id],
    );
    if (orderResult.rows.length === 0)
      throw { status: 404, message: "Order not found" };
    if (!orderResult.rows[0].applied_coupon_id)
      throw { status: 400, message: "No coupon applied to this order" };

    await client.query(
      `UPDATE orders
       SET applied_coupon_id=NULL,
           discount_price=NULL,
           updated_at=NOW()
       WHERE id=$1`,
      [order_id],
    );
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
  let whereConditions = [`o.user_id = $1 and o.status != 'draft'`];
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
    `SELECT COUNT(*) FROM orders o WHERE ${whereClause}`,
    values,
  );

  const result = await sql.query(
    `SELECT o.id, o.status, o.payment_status, o.clothes_count, o.estimated_weight_min, o.estimated_weight_max,
            o.amount_paid, o.remaining_amount, o.discount_price,o.estimated_total,
            o.pickup_special_instruction, o.delivery_special_instruction,
            o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
            o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
            o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
            o.created_at, o.updated_at, o.otp_generated_at,
            s.name AS service_name, s.image AS service_image,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date
     FROM orders o
     JOIN services s ON o.service_id=s.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id=pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id=delivery_slot.id
     WHERE ${whereClause}
     ORDER BY o.id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, limit, offset],
  );

  return { rows: result.rows, total: parseInt(countResult.rows[0].count) };
};

const CURRENT_ORDER_STATUSES = [
  "booked",
  "out_for_pickup",
  "pickup_in_progress",
  "picked_up",
  "in_process",
  "order_finalized",
  "ready_for_delivery",
  "out_for_delivery",
];

export const getCurrentUserOrdersService = async ({ user_id, limit = 3 }) => {
  const result = await sql.query(
    `SELECT o.id, o.status, o.payment_status, o.clothes_count, o.estimated_weight_min, o.estimated_weight_max,
            o.estimated_total, o.final_total, o.is_stained, o.vendor_request_amount,
            o.is_damaged, o.damage_count, o.damage_images,
            o.amount_paid, o.remaining_amount, o.discount_price, o.extra_price_per_kg,
            o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
            o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
            o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
            o.created_at, o.updated_at, o.otp_generated_at,
            s.name AS service_name, s.image AS service_image,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date
     FROM orders o
     JOIN services s ON o.service_id = s.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id = pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id = delivery_slot.id
     WHERE o.user_id = $1
       AND o.status = ANY($2)
     ORDER BY o.id DESC
     LIMIT $3`,
    [user_id, CURRENT_ORDER_STATUSES, limit],
  );

  return result.rows;
};

export const getUserOrderByIdService = async ({ user_id, order_id }) => {
  const result = await sql.query(
    `SELECT o.id, o.status,o.amount_paid, o.remaining_amount, o.discount_price ,o.payment_status, o.clothes_count, o.estimated_weight_min, o.estimated_weight_max, o.estimated_total, o.final_total, o.is_stained, o.vendor_request_amount, o.vendor_request_markup, o.vendor_revenue, o.vendor_amount_per_kg, o.extra_price_per_kg,
            o.is_damaged, o.damage_count, o.damage_images,
            o.pickup_special_instruction, o.delivery_special_instruction,
            o.booked_at, o.out_for_pickup_at, o.pickup_started_at, o.pickup_completed_at,
            o.vendor_received_at, o.order_finalized_at, o.ready_for_delivery_at,
            o.out_for_delivery_at, o.delivery_completed_at, o.cancelled_at, o.payment_completed_at,
            o.created_at, o.updated_at, o.otp_generated_at,
            s.name AS service_name, s.image AS service_image,
            pickup_slot.start_time AS pickup_start, pickup_slot.end_time AS pickup_end,
            TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
            delivery_slot.start_time AS delivery_start, delivery_slot.end_time AS delivery_end,
            TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date
     FROM orders o
     JOIN services s ON o.service_id=s.id
     LEFT JOIN time_slots pickup_slot ON o.pickup_slot_id=pickup_slot.id
     LEFT JOIN time_slots delivery_slot ON o.delivery_slot_id=delivery_slot.id
     WHERE o.id = $1 AND o.user_id = $2`,
    [order_id, user_id],
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: "Order not found" };
  }

  return result.rows[0];
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

    await assertPickupSlotAvailable(pickup_date, pickup_slot_id, order_id);

    await client.query(
      `UPDATE orders SET pickup_date=$1, pickup_slot_id=$2, updated_at=NOW() WHERE id=$3`,
      [pickup_date, pickup_slot_id, order_id],
    );

    await client.query("COMMIT");

    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Pickup Rescheduled',
      message: `Your pickup for order ${formatOrderDisplayId(order_id)} has been rescheduled to ${pickup_date}. We will send a rider at your selected slot.`,
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
      message: `Your delivery for order ${formatOrderDisplayId(order_id)} has been rescheduled to ${delivery_date}.`,
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
      `SELECT o.order_code,
              (o.pickup_date + ts.start_time) AS pickup_datetime
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
      `UPDATE orders SET status='cancelled', cancelled_at=NOW(), updated_at=NOW() WHERE id=$1`,
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

    const timestamps = await fetchOrderTimestamps(sql, order_id);

    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Order Cancelled',
      message: `Your order ${formatOrderDisplayId(order_id)} has been cancelled. A ₹500 coupon has been added to your account.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    const cancelledOrder = orderCheck.rows[0];
    sendUserEmailSafe(user_id, sendOrderCancelledEmail, {
      orderId: order_id,
      orderCode: cancelledOrder?.order_code,
    });

    return {
      order_id: parseInt(order_id, 10),
      status: 'cancelled',
      timestamps,
      cancelled_at: timestamps.cancelled_at,
    };
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
