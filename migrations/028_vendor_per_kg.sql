-- ============================================================
-- MIGRATION 028: Vendor per-kg payout rate
-- Alters: vendors (vendor_per_kg_amount)
-- Run after: 002_vendors.sql
-- ============================================================

ALTER TABLE public.vendors
    ADD COLUMN IF NOT EXISTS vendor_per_kg_amount NUMERIC(10,2) NOT NULL DEFAULT 90;

-- If an earlier draft of this migration added vendor_per_kg, migrate then drop it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vendors'
          AND column_name = 'vendor_per_kg'
    ) THEN
        UPDATE public.vendors
        SET vendor_per_kg_amount = vendor_per_kg
        WHERE vendor_per_kg IS NOT NULL;

        ALTER TABLE public.vendors DROP COLUMN vendor_per_kg;
    END IF;
END $$;
