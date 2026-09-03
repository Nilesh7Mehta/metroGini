/**
 * Loyalty coupons: existing `coupons` rows only.
 * Mark a row with auto_apply_loyalty = true.
 * - discount_type = percentage  → orders 1–2
 * - discount_type = per_kg      → orders 3+
 * Change discount_value anytime (15 today, 20 tomorrow) — no env needed.
 */

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

/** count < 2 → percentage tier; count >= 2 → per_kg tier (order 3+) */
export const resolveLoyaltyTier = (completedCount) =>
  Number(completedCount) < 2 ? 'percentage' : 'per_kg';

export const isLoyaltyCouponRow = (coupon) =>
  Boolean(coupon?.auto_apply_loyalty);

export const assertLoyaltyCouponAllowedForCount = (coupon, completedCount) => {
  if (!isLoyaltyCouponRow(coupon)) return;

  const tier = resolveLoyaltyTier(completedCount);

  if (tier === 'percentage' && coupon.discount_type === 'per_kg') {
    throw {
      status: 400,
      message: 'This coupon is only available from your 3rd order onward',
    };
  }
  if (tier === 'per_kg' && coupon.discount_type === 'percentage') {
    throw {
      status: 400,
      message: 'This coupon is only available for your first 2 orders',
    };
  }
};

const loadAutoApplyCouponByType = async (db, discountType) => {
  const { rows } = await db.query(
    `SELECT * FROM coupons
     WHERE auto_apply_loyalty = true
       AND discount_type = $1
       AND is_active = true
       AND start_date <= CURRENT_TIMESTAMP
       AND end_date >= CURRENT_TIMESTAMP
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [discountType],
  );
  return rows[0] || null;
};

export const resolveLoyaltyCoupon = async (db, completedCount) => {
  const tier = resolveLoyaltyTier(completedCount);
  return loadAutoApplyCouponByType(db, tier);
};
