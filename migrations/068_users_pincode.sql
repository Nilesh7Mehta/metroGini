-- ============================================================
-- MIGRATION 068: Users pincode
-- Pincode captured at login-or-register (before any address exists).
-- Run after: 001_users.sql
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_users_pincode
    ON public.users (pincode);
