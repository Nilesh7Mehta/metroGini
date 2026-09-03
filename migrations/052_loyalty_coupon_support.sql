-- ============================================================
-- MIGRATION 052: Loyalty coupon support (no new tables)
-- Alters: orders (auto_coupon_dismissed), coupons (discount_type check)
-- Run after: 005_coupons.sql, 006_orders.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS auto_coupon_dismissed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.coupons
    DROP CONSTRAINT IF EXISTS coupons_discount_type_check;

ALTER TABLE public.coupons
    ADD CONSTRAINT coupons_discount_type_check
    CHECK (discount_type IN ('percentage', 'flat', 'per_kg'));
