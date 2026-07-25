-- ============================================================
-- MIGRATION 034: Order damage reporting columns
-- Alters: orders (is_damaged, damage_count, damage_images)
-- Run after: 027_order_stain_images.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS is_damaged SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS damage_count INTEGER,
    ADD COLUMN IF NOT EXISTS damage_images JSONB;

COMMENT ON COLUMN public.orders.is_damaged IS '0 = no damage, 1 = damaged items reported at confirm-weight';
COMMENT ON COLUMN public.orders.damage_count IS 'Number of damaged items when is_damaged = 1';
COMMENT ON COLUMN public.orders.damage_images IS 'JSONB array of damage image paths (or {path} objects)';
