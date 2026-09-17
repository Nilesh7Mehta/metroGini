-- ============================================================
-- MIGRATION 054: Vendor coordinates for route optimization
-- Alters: vendors (latitude, longitude)
-- Run after: 002_vendors.sql
-- ============================================================

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.vendors.latitude IS 'Shop latitude for rider route depot (start/end)';
COMMENT ON COLUMN public.vendors.longitude IS 'Shop longitude for rider route depot (start/end)';

CREATE INDEX IF NOT EXISTS idx_vendors_coordinates
    ON public.vendors (latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
