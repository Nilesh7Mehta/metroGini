-- ============================================================
-- MIGRATION 016: Pincodes
-- Tables: pincodes
-- Run after: 015_pincode_groups.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pincodes (
    id               BIGSERIAL PRIMARY KEY,
    pincode          VARCHAR(10) NOT NULL,
    pincode_group_id BIGINT      NOT NULL,
    serviceable      BOOLEAN     NOT NULL DEFAULT true,
    CONSTRAINT fk_pincodes_group
        FOREIGN KEY (pincode_group_id)
        REFERENCES public.pincode_groups(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT uq_pincodes_pincode UNIQUE (pincode)
);

CREATE INDEX IF NOT EXISTS idx_pincodes_group
    ON public.pincodes (pincode_group_id);
