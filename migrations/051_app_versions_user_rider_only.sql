-- ============================================================
-- MIGRATION 051: App versions — user and rider only (no vendor app)
-- ============================================================

DELETE FROM public.app_versions WHERE app_for = 'vendor';

ALTER TABLE public.app_versions
  DROP CONSTRAINT IF EXISTS chk_app_versions_app_for;

ALTER TABLE public.app_versions
  ADD CONSTRAINT chk_app_versions_app_for
  CHECK (app_for IN ('user', 'rider'));
