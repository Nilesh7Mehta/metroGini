-- ============================================================
-- MIGRATION 012: Order lifecycle timestamps
-- Alters: orders (new TIMESTAMP columns, vendor_received_at type)
-- Run after: 006_orders.sql
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS booked_at              TIMESTAMP,
    ADD COLUMN IF NOT EXISTS out_for_pickup_at      TIMESTAMP,
    ADD COLUMN IF NOT EXISTS pickup_started_at      TIMESTAMP,
    ADD COLUMN IF NOT EXISTS pickup_completed_at    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS order_finalized_at     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ready_for_delivery_at  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS out_for_delivery_at    TIMESTAMP,
    ADD COLUMN IF NOT EXISTS delivery_completed_at  TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMP,
    ADD COLUMN IF NOT EXISTS payment_completed_at   TIMESTAMP;

ALTER TABLE public.orders
    ALTER COLUMN vendor_received_at TYPE TIMESTAMP
    USING vendor_received_at::timestamp;

-- Best-effort backfill for existing rows
UPDATE public.orders
SET pickup_completed_at = updated_at
WHERE otp_verified = true AND pickup_completed_at IS NULL;

UPDATE public.orders
SET delivery_completed_at = delivered_at::timestamp
WHERE status = 'delivered' AND delivery_completed_at IS NULL;

UPDATE public.orders
SET vendor_received_at = vendor_received_at::timestamp
WHERE vendor_received_at IS NOT NULL;
