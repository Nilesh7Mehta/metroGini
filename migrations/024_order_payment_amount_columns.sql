-- ============================================================
-- MIGRATION 024: Order payment amount columns
-- Alters: orders (remaining_amount, amount_paid, discount_price)
-- Run after: 006_orders.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS amount_paid      NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS discount_price   NUMERIC(10,2);
