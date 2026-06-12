-- ============================================================
-- MIGRATION 020: Rider admin profile fields
-- Alters: riders (zone, joining, license, vehicle, UPI)
-- Run after: 003_riders.sql
-- ============================================================

ALTER TABLE public.riders
    ADD COLUMN IF NOT EXISTS zone               VARCHAR(100),
    ADD COLUMN IF NOT EXISTS joining_date         DATE,
    ADD COLUMN IF NOT EXISTS driving_license      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS fuel_type            VARCHAR(50),
    ADD COLUMN IF NOT EXISTS insurance_status     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS upi_id               VARCHAR(100);
