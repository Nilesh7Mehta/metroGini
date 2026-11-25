-- ============================================================
-- MIGRATION 071: Wider referral codes (name + random, not USER##)
-- Run after: 070_user_referrals.sql
-- ============================================================

ALTER TABLE public.users
  ALTER COLUMN referral_code TYPE VARCHAR(40);
