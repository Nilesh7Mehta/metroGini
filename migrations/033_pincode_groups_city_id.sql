-- ============================================================
-- MIGRATION 033: Pincode groups city_id
-- Alters: pincode_groups (city_id after name / zone name)
-- Run after: 004_services.sql, 015_pincode_groups.sql
-- ============================================================

ALTER TABLE public.pincode_groups
    ADD COLUMN IF NOT EXISTS city_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_pincode_groups_city'
    ) THEN
        ALTER TABLE public.pincode_groups
            ADD CONSTRAINT fk_pincode_groups_city
            FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pincode_groups_city_id
    ON public.pincode_groups(city_id);
