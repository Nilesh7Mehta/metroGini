-- ============================================================
-- MIGRATION 019: Laundry slot capacity
-- Tables: laundry_slot_capacity
-- Run after: 003_riders.sql, Vendors table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.laundry_slot_capacity (
    id               BIGSERIAL PRIMARY KEY,
    laundry_id       BIGINT      NOT NULL,
    slot_date        DATE        NOT NULL,
    shift_id         INTEGER     NOT NULL,
    total_capacity   INTEGER     NOT NULL,
    used_capacity    INTEGER     NOT NULL DEFAULT 0,
    blocked_capacity INTEGER     NOT NULL DEFAULT 0,
    status           VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lsc_laundry
        FOREIGN KEY (laundry_id)
        REFERENCES public.vendors(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_lsc_shift
        FOREIGN KEY (shift_id)
        REFERENCES public.shifts(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT uq_lsc_laundry_date_shift
        UNIQUE (laundry_id, slot_date, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_lsc_date_shift
    ON public.laundry_slot_capacity (slot_date, shift_id);
