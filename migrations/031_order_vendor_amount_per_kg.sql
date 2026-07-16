-- ============================================================
-- MIGRATION 031: Order vendor per-kg snapshot
-- Alters: orders (vendor_amount_per_kg)
-- Run after: 028_vendor_per_kg.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS vendor_amount_per_kg NUMERIC(10,2);

-- Backfill snapshot for orders that already have vendor revenue calculated
UPDATE public.orders o
SET vendor_amount_per_kg = COALESCE(v.vendor_per_kg_amount, 90)
FROM public.vendors v
WHERE o.vendor_id = v.id
  AND o.vendor_amount_per_kg IS NULL
  AND o.vendor_revenue IS NOT NULL
  AND o.actual_weight IS NOT NULL
  AND o.actual_weight > 0;
