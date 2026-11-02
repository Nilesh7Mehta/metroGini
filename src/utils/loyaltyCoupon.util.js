/**
 * Loyalty coupons: existing `coupons` rows only.
 * Mark a row with auto_apply_loyalty = true and give it an order-number range
 * (loyalty_order_from..loyalty_order_to, NULL "to" = open-ended), e.g.
 *   order 1   → WELCOME20 (percentage 20)
 *   order 2   → SECOND15  (percentage 15)
 *   order 3+  → LOYAL5KG  (per_kg 5)
 * Change discount_value or ranges anytime from admin — no env needed.
 */

export const LOYALTY_DISCOUNT_TYPES = ['percentage', 'per_kg'];

/** Legacy default range when a loyalty coupon has no explicit sequence set. */
export const defaultLoyaltyRangeForType = (discountType) =>
  discountType === 'per_kg' ? { from: 2, to: null } : { from: 1, to: 1 };

export const getCompletedOrderCount = async (
  db,
  userId,
  excludeOrderId = null,
) => {
  const params = [userId];
  let excludeClause = '';
  if (excludeOrderId != null) {
    params.push(excludeOrderId);
    excludeClause = ` AND id <> $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM orders
     WHERE user_id = $1
       AND status NOT IN ('draft', 'cancelled')
       ${excludeClause}`,
    params,
  );

  return Number(rows[0]?.count || 0);
};

/** Previous (non-draft, non-cancelled) orders + 1 = this order's number. */
export const resolveLoyaltyOrderNumber = (completedCount) =>
  Number(completedCount || 0) + 1;

export const isLoyaltyCouponRow = (coupon) =>
  Boolean(coupon?.auto_apply_loyalty);

const resolveCouponRange = (coupon) => {
  if (coupon?.loyalty_order_from == null) {
    return defaultLoyaltyRangeForType(coupon?.discount_type);
  }
  return {
    from: Number(coupon.loyalty_order_from),
    to: coupon.loyalty_order_to == null ? null : Number(coupon.loyalty_order_to),
  };
};

const ordinal = (n) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
};

export const describeLoyaltyRange = ({ from, to }) => {
  if (to == null) return from <= 1 ? 'all orders' : `your ${ordinal(from)} order onward`;
  if (from === to) return `your ${from === 1 ? 'first' : ordinal(from)} order`;
  return `your ${ordinal(from)} to ${ordinal(to)} orders`;
};

export const assertLoyaltyCouponAllowedForCount = (coupon, completedCount) => {
  if (!isLoyaltyCouponRow(coupon)) return;

  const orderNumber = resolveLoyaltyOrderNumber(completedCount);
  const range = resolveCouponRange(coupon);

  if (orderNumber < range.from || (range.to != null && orderNumber > range.to)) {
    throw {
      status: 400,
      message: `This coupon is only available for ${describeLoyaltyRange(range)}`,
    };
  }
};

export const resolveLoyaltyCoupon = async (db, completedCount) => {
  const orderNumber = resolveLoyaltyOrderNumber(completedCount);
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE auto_apply_loyalty = true
       AND is_active = true
       AND start_date <= CURRENT_TIMESTAMP
       AND end_date >= CURRENT_TIMESTAMP
       AND loyalty_order_from IS NOT NULL
       AND loyalty_order_from <= $1
       AND (loyalty_order_to IS NULL OR loyalty_order_to >= $1)
     ORDER BY loyalty_order_from DESC, updated_at DESC, id DESC
     LIMIT 1`,
    [orderNumber],
  );
  return rows[0] || null;
};
