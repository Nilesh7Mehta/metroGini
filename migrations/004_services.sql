-- ============================================================
-- MIGRATION 004: Services & Time Slots
-- Tables: services, service_types, time_slots, cities, banners
-- ============================================================

CREATE TABLE IF NOT EXISTS public.services (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    base_price_per_kg NUMERIC(10,2) NOT NULL,
    image            TEXT,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT now(),
    updated_at       TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_types (
    id                SERIAL PRIMARY KEY,
    service_id        INTEGER,
    name              VARCHAR(50) NOT NULL,
    extra_price_per_kg NUMERIC(10,2) DEFAULT 0,
    flat_fee          NUMERIC(10,2) DEFAULT 0,
    delivery_hours    INTEGER,
    is_active         BOOLEAN DEFAULT true,
    created_at        TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_service_types_service FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.time_slots (
    id               SERIAL PRIMARY KEY,
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    is_peak          BOOLEAN DEFAULT false,
    peak_extra_charge NUMERIC(10,2) DEFAULT 0,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT now(),
    updated_at       TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cities (
    id           SERIAL PRIMARY KEY,
    city_name    VARCHAR(100) NOT NULL UNIQUE,
    image        TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at   TIMESTAMP DEFAULT now(),
    updated_at   TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.banners (
    id          SERIAL PRIMARY KEY,
    image_url   TEXT NOT NULL,
    heading     VARCHAR(255),
    subheading  VARCHAR(255),
    description TEXT,
    status      BOOLEAN DEFAULT true,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
