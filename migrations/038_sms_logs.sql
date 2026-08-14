-- ============================================================
-- MIGRATION 038: SMS logs (SpringEdge)
-- Stores outbound SMS + SpringEdge message ID for later status query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sms_logs (
    id                      SERIAL PRIMARY KEY,
    template_key            VARCHAR(64) NOT NULL,
    dlt_template_id         VARCHAR(64) NOT NULL,
    mobile                  VARCHAR(20) NOT NULL,
    message                 TEXT NOT NULL,
    springedge_message_id   VARCHAR(128),
    status                  VARCHAR(20) NOT NULL DEFAULT 'queued',
    provider_response       JSONB,
    error_code              VARCHAR(64),
    error_message           TEXT,
    reference_type          VARCHAR(50),
    reference_id            BIGINT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_message_id
  ON public.sms_logs (springedge_message_id);

CREATE INDEX IF NOT EXISTS idx_sms_logs_mobile
  ON public.sms_logs (mobile);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at
  ON public.sms_logs (created_at DESC);
