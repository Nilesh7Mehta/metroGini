-- ============================================================
-- MIGRATION 033: Order special instructions
-- Alters: orders (pickup_special_instruction, delivery_special_instruction)
-- Run after: 006_orders.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pickup_special_instruction   TEXT,
    ADD COLUMN IF NOT EXISTS delivery_special_instruction TEXT;
