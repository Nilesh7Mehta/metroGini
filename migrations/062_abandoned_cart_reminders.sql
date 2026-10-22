-- ============================================================
-- MIGRATION 062: Abandoned cart reminders
-- Tracks abandoned_cart_reminder WhatsApp sends for draft orders.
-- UNIQUE (user_id, sent_on) enforces max one reminder per user per IST day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.abandoned_cart_reminders (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    order_id   INTEGER NOT NULL,
    sent_on    DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_abandoned_cart_user_day UNIQUE (user_id, sent_on),
    CONSTRAINT fk_abandoned_cart_user  FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_abandoned_cart_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminders_order_id
  ON public.abandoned_cart_reminders(order_id);
