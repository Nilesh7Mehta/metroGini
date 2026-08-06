-- ============================================================
-- MIGRATION 037: Partner leads (public partner interest form)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_leads (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) NOT NULL,
    phone      VARCHAR(20)  NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_partner_leads_email
    ON public.partner_leads(email);
