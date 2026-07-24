-- ============================================================
-- MIGRATION 015: Pincode groups
-- Tables: pincode_groups
-- Run after: 004_services.sql (cities)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pincode_groups (
    id          BIGSERIAL PRIMARY KEY,
    group_code  VARCHAR(50)  NOT NULL,
    name        VARCHAR(150) NOT NULL,
    city_id     INTEGER,
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pincode_groups_code UNIQUE (group_code),
    CONSTRAINT fk_pincode_groups_city
      FOREIGN KEY (city_id) REFERENCES public.cities(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pincode_groups_city_id
    ON public.pincode_groups(city_id);
