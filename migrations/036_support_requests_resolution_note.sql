-- ============================================================
-- MIGRATION 036: Support request resolution note
-- Alters: support_requests (resolution_note)
-- Run after: 011_support_requests.sql
-- ============================================================

ALTER TABLE public.support_requests
    ADD COLUMN IF NOT EXISTS resolution_note TEXT;
