-- ============================================================
-- MIGRATION 064: Incomplete booking reminders
-- Reminders now also go to registered users with no draft order,
-- so order_id is optional. Run after: 062_abandoned_cart_reminders.sql
-- ============================================================

ALTER TABLE public.abandoned_cart_reminders
    ALTER COLUMN order_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminders_user_id
  ON public.abandoned_cart_reminders(user_id);
