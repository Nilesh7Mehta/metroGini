-- ============================================================
-- MIGRATION 026: Order vendor revenue + request markup columns
-- Alters: orders (vendor_revenue, vendor_request_markup)
-- Run after: 023_order_stain_columns.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS vendor_revenue NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS vendor_request_markup NUMERIC(10,2);
