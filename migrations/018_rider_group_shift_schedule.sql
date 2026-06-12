-- ============================================================
-- MIGRATION 018: Rider group shift schedule
-- Tables: rider_group_shift_schedule
-- Run after: 003_riders.sql, 015_pincode_groups.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rider_group_shift_schedule (
    id               BIGSERIAL PRIMARY KEY,
    pincode_group_id BIGINT      NOT NULL,
    day_of_week      SMALLINT    NOT NULL,
    shift_id         INTEGER     NOT NULL,
    rider_id         INTEGER     NOT NULL,
    created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rgss_group
        FOREIGN KEY (pincode_group_id)
        REFERENCES public.pincode_groups(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_rgss_shift
        FOREIGN KEY (shift_id)
        REFERENCES public.shifts(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_rgss_rider
        FOREIGN KEY (rider_id)
        REFERENCES public.riders(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT uq_rgss_group_day_shift
        UNIQUE (pincode_group_id, day_of_week, shift_id)
);

CREATE INDEX IF NOT EXISTS idx_rgss_rider
    ON public.rider_group_shift_schedule (rider_id);
