-- ============================================================
-- MIGRATION 025: Device FCM tokens (push notifications)
-- Tables: device_tokens
-- Run after: 001_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
    id           SERIAL PRIMARY KEY,
    identity_id  BIGINT NOT NULL,
    role         VARCHAR(20) NOT NULL DEFAULT 'user',
    fcm_token    TEXT NOT NULL,
    platform     VARCHAR(20),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_identity
    ON public.device_tokens (identity_id, role);
