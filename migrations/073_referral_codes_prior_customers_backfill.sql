-- ============================================================
-- MIGRATION 073: Marker — backfill referral codes for prior customers
-- Data rewrite is done by:
--   node scripts/backfill-referral-codes-prior-customers.mjs
-- Unlocks name+random codes for users who already placed a
-- non-draft/non-cancelled order (so they can share with new users).
-- Run after: 072_referral_codes_name_random_backfill.sql
-- ============================================================

SELECT 1;
