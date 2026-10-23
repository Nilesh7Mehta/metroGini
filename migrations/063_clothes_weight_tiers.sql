-- ============================================================
-- MIGRATION 063: Clothes weight tiers
-- Maps a clothes count range to an estimated weight range (kg).
-- Used when creating a draft order to set min_weight / max_weight.
-- Seeded with the previously hardcoded tiers.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clothes_weight_tiers (
    id           SERIAL PRIMARY KEY,
    min_clothes  INTEGER NOT NULL CHECK (min_clothes > 0),
    max_clothes  INTEGER NOT NULL,
    min_kg       NUMERIC(6, 2) NOT NULL CHECK (min_kg > 0),
    max_kg       NUMERIC(6, 2) NOT NULL,
    status       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_clothes_weight_tiers_clothes CHECK (max_clothes >= min_clothes),
    CONSTRAINT chk_clothes_weight_tiers_kg CHECK (max_kg >= min_kg)
);

CREATE INDEX IF NOT EXISTS idx_clothes_weight_tiers_status
    ON public.clothes_weight_tiers(status, min_clothes);

INSERT INTO public.clothes_weight_tiers (min_clothes, max_clothes, min_kg, max_kg)
SELECT v.min_clothes, v.max_clothes, v.min_kg, v.max_kg
FROM (VALUES
    (10, 14, 3.0, 4.0),
    (15, 20, 5.0, 6.0),
    (21, 25, 7.0, 8.0)
) AS v(min_clothes, max_clothes, min_kg, max_kg)
WHERE NOT EXISTS (SELECT 1 FROM public.clothes_weight_tiers);
