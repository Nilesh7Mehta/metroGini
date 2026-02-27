export const ORDER_STATUS = {
  DRAFT : "draft",  
  CREATED: "created",
  CONFIRMED: "confirmed",
  PICKED_UP: "picked_up",
  IN_PROCESS: "in_process",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
};

export const PAYMENT_TYPE = {
  ADVANCE: "advance",
  REMAINING: "remaining",
};

export const applyCoupon1 = async (req, res, next) => {
  try {
    const order_id = req.params.id;
    const user_id = req.user.id;
    const { coupon_code } = req.body;

    if (!coupon_code) {
      return res.status(400).json({
        message: "Coupon code is required",
      });
    }

    // 1️⃣ Check Order
    const orderResult = await sql.query(
      `SELECT * FROM orders
       WHERE id = $1
       AND user_id = $2
       AND status = 'created'`,
      [order_id, user_id],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // 2️⃣ Validate Coupon
    const couponResult = await sql.query(
      `SELECT * FROM coupons
       WHERE UPPER(coupon_code) = UPPER($1)
       AND is_active = true
       AND start_date <= CURRENT_TIMESTAMP
       AND end_date >= CURRENT_TIMESTAMP`,
      [coupon_code],
    );

    if (couponResult.rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired coupon",
      });
    }

    const coupon = couponResult.rows[0];

    // 3️⃣ Check Global Usage Limit
    if (
      coupon.usage_limit !== null &&
      coupon.used_count >= coupon.usage_limit
    ) {
      return res.status(400).json({
        message: "Coupon usage limit exceeded",
      });
    }

    // 4️⃣ Check Per-User Limit
    if (coupon.per_user_limit !== null) {
      const usageCheck = await sql.query(
        `SELECT COUNT(*) FROM coupon_usages
         WHERE coupon_id = $1
         AND user_id = $2`,
        [coupon.id, user_id],
      );

      const userUsageCount = Number(usageCheck.rows[0].count);

      if (userUsageCount >= coupon.per_user_limit) {
        return res.status(400).json({
          message: "You have already used this coupon",
        });
      }
    }

    // 5️⃣ Replace Existing Coupon (if any)
    await sql.query(
      `UPDATE orders
       SET applied_coupon_id = $1
       WHERE id = $2`,
      [coupon.id, order_id],
    );

    return res.status(200).json({
      message: "Coupon applied successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const removeCoupon1 = async (req, res, next) => {
  try {
    const order_id = req.params.id;
    const user_id = req.user.id;

    // 1️⃣ Check order exists
    const orderResult = await sql.query(
      `SELECT applied_coupon_id
       FROM orders
       WHERE id = $1
       AND user_id = $2
       AND status = 'created'`,
      [order_id, user_id],
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const existingCoupon = orderResult.rows[0].applied_coupon_id;

    if (!existingCoupon) {
      return res.status(400).json({
        message: "No coupon applied to this order",
      });
    }

    // 2️⃣ Remove coupon
    await sql.query(
      `UPDATE orders
       SET applied_coupon_id = NULL
       WHERE id = $1`,
      [order_id],
    );

    return res.status(200).json({
      message: "Coupon removed successfully",
    });
  } catch (error) {
    next(error);
  }
};