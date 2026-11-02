-- ============================================================
-- MIGRATION 066: Loyalty coupon sequence (order-number ranges)
-- Each auto_apply_loyalty coupon covers orders loyalty_order_from..loyalty_order_to
-- (NULL "to" = open-ended). Replaces the one-coupon-per-discount_type rule,
-- so e.g. order 1 = 20%, order 2 = 15%, order 3+ = per_kg.
-- Run after: 053_coupon_auto_apply_loyalty.sql
-- ============================================================

ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS loyalty_order_from INT,
    ADD COLUMN IF NOT EXISTS loyalty_order_to   INT;

-- Keep current behaviour: percentage → order 1, per_kg → order 2+
UPDATE public.coupons
   SET loyalty_order_from = 1, loyalty_order_to = 1
 WHERE auto_apply_loyalty = true
   AND discount_type = 'percentage'
   AND loyalty_order_from IS NULL;

UPDATE public.coupons
   SET loyalty_order_from = 2, loyalty_order_to = NULL
 WHERE auto_apply_loyalty = true
   AND discount_type = 'per_kg'
   AND loyalty_order_from IS NULL;

ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_loyalty_order_range_check;

ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_loyalty_order_range_check
    CHECK (
      (loyalty_order_from IS NULL OR loyalty_order_from >= 1)
      AND (loyalty_order_to IS NULL OR loyalty_order_to >= COALESCE(loyalty_order_from, 1))
    );

DROP INDEX IF EXISTS idx_coupons_one_auto_apply_per_type;

COMMENT ON COLUMN public.coupons.auto_apply_loyalty IS
  'When true: auto-applied on the user''s Nth order where loyalty_order_from <= N <= loyalty_order_to (NULL to = forever). Amount is discount_value on this row.';
COMMENT ON COLUMN public.coupons.loyalty_order_from IS
  'Loyalty sequence: first order number (1-based) this coupon auto-applies to.';
COMMENT ON COLUMN public.coupons.loyalty_order_to IS
  'Loyalty sequence: last order number this coupon auto-applies to; NULL = all later orders.';
