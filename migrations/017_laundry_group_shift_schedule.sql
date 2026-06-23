-- ============================================================
-- MIGRATION 017: Laundry group shift schedule
-- Tables: laundry_group_shift_schedule
-- Run after: 003_riders.sql, 015_pincode_groups.sql, Vendors table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.laundry_group_shift_schedule (
    id               BIGSERIAL PRIMARY KEY,
    pincode_group_id BIGINT      NOT NULL,
    day_of_week      SMALLINT    NOT NULL, -- 1=Mon ... 7=Sun
    shift_id         INTEGER     NOT NULL,
    laundry_id       BIGINT      NOT NULL,
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lgss_group
        FOREIGN KEY (pincode_group_id)
        REFERENCES public.pincode_groups(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_lgss_shift
        FOREIGN KEY (shift_id)
        REFERENCES public.shifts(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_lgss_laundry
        FOREIGN KEY (laundry_id)
        REFERENCES public.vendors(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT uq_lgss_group_day_shift
        UNIQUE (pincode_group_id, day_of_week, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_lgss_laundry
    ON public.laundry_group_shift_schedule (laundry_id);
