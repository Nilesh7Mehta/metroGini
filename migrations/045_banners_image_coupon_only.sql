-- ============================================================
-- MIGRATION 045: Banners are image + coupon only, max 2 rows
-- Alters: banners (drop heading/subheading/description/status)
-- Run after: 044_banners_coupon_id.sql
-- ============================================================

DELETE FROM public.banners
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id FROM public.banners ORDER BY id ASC LIMIT 2
  ) AS keep_rows
);

ALTER TABLE public.banners
    DROP COLUMN IF EXISTS heading,
    DROP COLUMN IF EXISTS subheading,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS status;

CREATE OR REPLACE FUNCTION public.enforce_banners_max_two()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.banners) >= 2 THEN
    RAISE EXCEPTION 'A maximum of 2 banners are allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_banners_max_two ON public.banners;

CREATE TRIGGER trg_banners_max_two
BEFORE INSERT ON public.banners
FOR EACH ROW
EXECUTE PROCEDURE public.enforce_banners_max_two();
