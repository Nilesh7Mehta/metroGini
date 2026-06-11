-- ============================================================
-- MIGRATION 014: Vendor merchant profile (admin create merchant)
-- Alters: vendors (business, equipment, capacity columns)
-- Run after: 002_vendors.sql, 010_vendor_auth.sql
-- ============================================================

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS service_area            TEXT,
    ADD COLUMN IF NOT EXISTS working_days            TEXT,
    ADD COLUMN IF NOT EXISTS working_hours           TEXT,
    ADD COLUMN IF NOT EXISTS business_type           VARCHAR(50),
    ADD COLUMN IF NOT EXISTS registration_date       DATE,
    ADD COLUMN IF NOT EXISTS washing_machines        TEXT,
    ADD COLUMN IF NOT EXISTS washing_capacity_kg     VARCHAR(50),
    ADD COLUMN IF NOT EXISTS dryers                  TEXT,
    ADD COLUMN IF NOT EXISTS iron_stations           TEXT,
    ADD COLUMN IF NOT EXISTS dry_cleaning_machines   TEXT,
    ADD COLUMN IF NOT EXISTS detergents_used         TEXT,
    ADD COLUMN IF NOT EXISTS fabric_conditioners     TEXT,
    ADD COLUMN IF NOT EXISTS special_chemicals       TEXT,
    ADD COLUMN IF NOT EXISTS special_handling        TEXT,
    ADD COLUMN IF NOT EXISTS quality_checks          TEXT,
    ADD COLUMN IF NOT EXISTS water_supply            TEXT,
    ADD COLUMN IF NOT EXISTS power_backup            TEXT,
    ADD COLUMN IF NOT EXISTS upi_id                  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS max_wash_kg             NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS max_dry_pcs             INTEGER;
