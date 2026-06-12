-- ============================================================
-- MIGRATION 015: Pincode groups
-- Tables: pincode_groups
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pincode_groups (
    id          BIGSERIAL PRIMARY KEY,
    group_code  VARCHAR(50)  NOT NULL,
    name        VARCHAR(150) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pincode_groups_code UNIQUE (group_code)
);
