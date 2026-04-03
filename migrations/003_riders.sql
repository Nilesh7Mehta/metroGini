-- ============================================================
-- MIGRATION 003: Riders
-- Tables: shifts, riders, rider_helpline
-- Run after: 001_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shifts (
    id          SERIAL PRIMARY KEY,
    shift_name  VARCHAR(50) NOT NULL,
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    status      BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.riders (
    id                              SERIAL PRIMARY KEY,
    full_name                       VARCHAR(100),
    mobile_number                   VARCHAR(15) UNIQUE,
    alternate_contact_number        VARCHAR(15),
    aadhaar_number                  VARCHAR(20),
    pan_card_number                 VARCHAR(20),
    date_of_birth                   DATE,
    residential_address             TEXT,
    vehicle_type                    VARCHAR(50),
    vehicle_registration_number     VARCHAR(50),
    licence_validity_date           DATE,
    account_holder_name             VARCHAR(100),
    bank_name                       VARCHAR(100),
    account_number                  VARCHAR(50),
    ifsc_code                       VARCHAR(20),
    image                           TEXT,
    otp                             VARCHAR(4),
    otp_expires_at                  TIMESTAMP,
    otp_attempts                    INTEGER DEFAULT 0,
    profile_completed               BOOLEAN DEFAULT false,
    shift_id                        INTEGER,
    shift_started_at                TIMESTAMP,
    is_active                       BOOLEAN DEFAULT false,
    is_terms_and_condition_verified BOOLEAN DEFAULT false,
    status                          VARCHAR(20) DEFAULT 'pending',
    created_at                      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT riders_status_check CHECK (status IN ('pending', 'active', 'inactive', 'blocked')),
    CONSTRAINT fk_riders_shift FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.rider_helpline (
    id           SERIAL PRIMARY KEY,
    rider_id     INTEGER NOT NULL,
    report_issue VARCHAR(255) NOT NULL,
    message      TEXT NOT NULL,
    status       VARCHAR(50) DEFAULT 'pending',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rider_helpline_rider FOREIGN KEY (rider_id) REFERENCES public.riders(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_riders_status       ON public.riders(status);
CREATE INDEX IF NOT EXISTS idx_riders_is_active    ON public.riders(is_active);
CREATE INDEX IF NOT EXISTS idx_riders_shift_id     ON public.riders(shift_id);
CREATE INDEX IF NOT EXISTS idx_rider_helpline_rider ON public.rider_helpline(rider_id);
