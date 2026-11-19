-- ============================================================
-- MIGRATION 069: Registration → not-ordered reminder steps
-- Tracks which of the 6 Gallabox templates
-- (1_reminder_reg_not_ordered … 6_reminder_reg_not_ordered)
-- has been sent. UNIQUE (user_id, step) = each step once.
-- Run after: 064_incomplete_booking_reminders.sql
-- ============================================================

ALTER TABLE public.abandoned_cart_reminders
  ADD COLUMN IF NOT EXISTS step SMALLINT;

-- Backfill existing rows as steps 1..N per user (oldest first)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.abandoned_cart_reminders
  WHERE step IS NULL
)
UPDATE public.abandoned_cart_reminders r
SET step = ranked.rn
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn BETWEEN 1 AND 6;

-- Drop any leftover rows beyond step 6 from old daily sends
DELETE FROM public.abandoned_cart_reminders
WHERE step IS NULL OR step < 1 OR step > 6;

ALTER TABLE public.abandoned_cart_reminders
  ALTER COLUMN step SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_abandoned_cart_user_day'
  ) THEN
    ALTER TABLE public.abandoned_cart_reminders
      DROP CONSTRAINT uq_abandoned_cart_user_day;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_abandoned_cart_user_step'
  ) THEN
    ALTER TABLE public.abandoned_cart_reminders
      ADD CONSTRAINT uq_abandoned_cart_user_step UNIQUE (user_id, step);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_abandoned_cart_step'
  ) THEN
    ALTER TABLE public.abandoned_cart_reminders
      ADD CONSTRAINT chk_abandoned_cart_step
      CHECK (step BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_reminders_step
  ON public.abandoned_cart_reminders (step);
