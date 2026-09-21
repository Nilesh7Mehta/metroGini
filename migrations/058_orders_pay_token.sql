-- ============================================================
-- MIGRATION 058: Opaque public pay token for /api/pay/:token
-- Alters: orders
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS pay_token VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pay_token
    ON public.orders (pay_token)
    WHERE pay_token IS NOT NULL;
