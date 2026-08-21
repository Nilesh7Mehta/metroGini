-- ============================================================
-- MIGRATION 044: Banner coupon link
-- Alters: banners (coupon_id)
-- Run after: 004_services.sql, 005_coupons.sql
-- ============================================================

ALTER TABLE public.banners
    ADD COLUMN IF NOT EXISTS coupon_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_banners_coupon'
  ) THEN
    ALTER TABLE public.banners
      ADD CONSTRAINT fk_banners_coupon
      FOREIGN KEY (coupon_id)
      REFERENCES public.coupons(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_banners_coupon_id
  ON public.banners(coupon_id);
