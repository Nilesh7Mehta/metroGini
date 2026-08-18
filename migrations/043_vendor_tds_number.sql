-- ============================================================
-- MIGRATION 043: Vendor TDS number
-- Alters: vendors (tds_number)
-- Run after: 002_vendors.sql
-- ============================================================

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS tds_number VARCHAR(50);
