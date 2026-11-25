-- ============================================================
-- MIGRATION 072: Marker — personal referral codes use name+random
-- Data rewrite is done by:
--   node scripts/migrate-referral-codes-name-random.mjs
-- (re-issues coupons.coupon_code + users.referral_code for all
--  existing personal referral codes, including legacy USER##.)
-- Run after: 071_referral_code_name_random.sql
-- ============================================================

SELECT 1;
