-- ============================================================
-- MIGRATION 065: Incomplete booking email reminders
-- Tracks incomplete booking emails for draft orders (add to cart, never booked).
-- UNIQUE (user_id, sent_on) enforces max one email per user per IST day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.incomplete_booking_email_reminders (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    order_id   INTEGER,
    sent_on    DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_incomplete_booking_email_user_day UNIQUE (user_id, sent_on),
    CONSTRAINT fk_incomplete_booking_email_user  FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_incomplete_booking_email_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_incomplete_booking_email_reminders_user_id
  ON public.incomplete_booking_email_reminders(user_id);
