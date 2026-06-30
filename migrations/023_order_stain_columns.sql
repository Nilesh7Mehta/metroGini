-- ============================================================
-- MIGRATION 023: Order stain reporting columns
-- Alters: orders (is_stained, stain_image, vendor_request_amount)
-- Run after: 006_orders.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS is_stained SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stain_image VARCHAR(500),
    ADD COLUMN IF NOT EXISTS vendor_request_amount NUMERIC(10,2);
