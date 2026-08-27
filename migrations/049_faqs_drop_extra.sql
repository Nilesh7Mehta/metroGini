-- ============================================================
-- MIGRATION 049: Remove faqs.extra JSON column
-- Safe if 048 never had extra (DROP IF EXISTS)
-- ============================================================

ALTER TABLE public.faqs DROP COLUMN IF EXISTS extra;

