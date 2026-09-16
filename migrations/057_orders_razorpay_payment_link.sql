-- ============================================================
-- MIGRATION 057: Store Razorpay payment link for WhatsApp /api/pay/:id
-- Alters: orders
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS razorpay_payment_link_id  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS razorpay_payment_link_url TEXT;
