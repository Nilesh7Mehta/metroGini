-- ============================================================
-- MIGRATION 039: Email logs
-- Stores outbound email attempts (SMTP message id + status)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_logs (
    id                      SERIAL PRIMARY KEY,
    email_type              VARCHAR(64) NOT NULL,
    recipient               VARCHAR(255) NOT NULL,
    subject                 VARCHAR(255),
    provider_message_id     VARCHAR(255),
    status                  VARCHAR(20) NOT NULL DEFAULT 'queued',
    error_code              VARCHAR(64),
    error_message           TEXT,
    reference_type          VARCHAR(50),
    reference_id            BIGINT,
    user_id                 BIGINT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient
  ON public.email_logs (recipient);

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at
  ON public.email_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_type_status
  ON public.email_logs (email_type, status);
