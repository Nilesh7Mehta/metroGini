-- ============================================================
-- MIGRATION 040: Push / FCM logs
-- Stores outbound push attempts (success/fail/skip counts)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_logs (
    id                      SERIAL PRIMARY KEY,
    user_id                 BIGINT NOT NULL,
    title                   VARCHAR(255),
    body                    TEXT,
    status                  VARCHAR(20) NOT NULL DEFAULT 'queued',
    tokens_count            INTEGER DEFAULT 0,
    success_count           INTEGER DEFAULT 0,
    failure_count           INTEGER DEFAULT 0,
    skip_reason             VARCHAR(128),
    error_code              VARCHAR(128),
    error_message           TEXT,
    provider_response       JSONB,
    reference_type          VARCHAR(50),
    reference_id            BIGINT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_logs_user_id
  ON public.push_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_push_logs_created_at
  ON public.push_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_logs_status
  ON public.push_logs (status);
