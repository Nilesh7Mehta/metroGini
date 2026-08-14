-- ============================================================
-- MIGRATION 041: Razorpay webhook event logs
-- Stores inbound webhook payloads + processing outcome
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
    id                      SERIAL PRIMARY KEY,
    provider                VARCHAR(32) NOT NULL DEFAULT 'razorpay',
    event                   VARCHAR(100),
    event_key               VARCHAR(191),
    razorpay_payment_id     VARCHAR(100),
    order_id                BIGINT,
    signature_valid         BOOLEAN,
    status                  VARCHAR(32) NOT NULL DEFAULT 'received',
    error_message           TEXT,
    payload                 JSONB,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_created_at
  ON public.payment_webhook_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment_id
  ON public.payment_webhook_events (razorpay_payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_order_id
  ON public.payment_webhook_events (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_event_key
  ON public.payment_webhook_events (event_key);
