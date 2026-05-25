-- ============================================================
-- MIGRATION 010: Vendor email/password auth
-- Adds dob and password to vendors
-- ============================================================

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS dob DATE,
    ADD COLUMN IF NOT EXISTS password VARCHAR(255);
