-- ============================================================
-- MIGRATION 067: Rider attendance (check-in / check-out sessions)
-- One row per session. A rider may check in again the same day
-- (e.g. app crashed / session broke) but only one session can be open.
-- Run after: 003_riders.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rider_attendance (
    id                BIGSERIAL PRIMARY KEY,
    rider_id          INTEGER   NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
    work_date         DATE      NOT NULL,
    check_in_at       TIMESTAMP NOT NULL,
    check_out_at      TIMESTAMP,
    auto_checked_out  BOOLEAN   NOT NULL DEFAULT false,
    worked_minutes    INTEGER,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- At most one open (not checked-out) session per rider
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_attendance_open_session
    ON public.rider_attendance (rider_id)
    WHERE check_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rider_attendance_rider_date
    ON public.rider_attendance (rider_id, work_date);

CREATE INDEX IF NOT EXISTS idx_rider_attendance_date
    ON public.rider_attendance (work_date);

COMMENT ON TABLE public.rider_attendance IS
  'Rider check-in / check-out sessions. Times are APP_TIMEZONE (Asia/Kolkata) wall-clock.';
COMMENT ON COLUMN public.rider_attendance.auto_checked_out IS
  'true when the nightly job closed a session the rider left open.';
