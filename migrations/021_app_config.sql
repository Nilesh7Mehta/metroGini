-- ============================================================
-- MIGRATION 021: App Config
-- Tables: app_config
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_config (
    id               SERIAL PRIMARY KEY,
    support_email    VARCHAR(255),
    support_phone_no VARCHAR(50),
    advance_amount   NUMERIC(10,2) DEFAULT 0,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.app_config (id, support_email, support_phone_no, advance_amount)
VALUES (1, '', '', 0)
ON CONFLICT (id) DO NOTHING;
