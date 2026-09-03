-- ============================================================
-- MIGRATION 053: Mark loyalty auto-apply coupons on coupons table
-- No env / no hardcoded amounts — discount_value comes from the row
-- ============================================================

ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS auto_apply_loyalty BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coupons.auto_apply_loyalty IS
  'When true: percentage = auto for orders 1-2; per_kg = auto for orders 3+. Amount is discount_value on this row.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_one_auto_apply_per_type
  ON public.coupons (discount_type)
  WHERE auto_apply_loyalty = true AND is_active = true;
