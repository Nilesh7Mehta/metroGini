-- ============================================================
-- MIGRATION 029: Coupon maximum amount value
-- Alters: coupons (maximum_amount_value)
-- Run after: 005_coupons.sql
-- ============================================================

ALTER TABLE public.coupons
    ADD COLUMN IF NOT EXISTS maximum_amount_value NUMERIC(10,2);
