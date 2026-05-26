-- ============================================================
-- MIGRATION 011: Unified support / need-help requests
-- Replaces per-role inserts into helpline + rider_helpline for new requests
-- Run after: 001_users.sql, 002_vendors.sql, 003_riders.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_requests (
    id           SERIAL PRIMARY KEY,
    type         VARCHAR(20) NOT NULL CHECK (type IN ('user', 'rider', 'vendor')),
    identity_id  BIGINT NOT NULL,
    report_issue VARCHAR(255),
    message      TEXT NOT NULL,
    status       VARCHAR(20) DEFAULT 'open',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_requests_type_identity
    ON public.support_requests(type, identity_id);

CREATE INDEX IF NOT EXISTS idx_support_requests_status
    ON public.support_requests(status);
