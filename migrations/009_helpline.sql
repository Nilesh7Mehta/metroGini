-- ============================================================
-- MIGRATION 009: Helpline
-- Tables: helpline (user), rider_helpline
-- Run after: 001_users.sql, 003_riders.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.helpline (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    message    TEXT NOT NULL,
    status     VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_helpline_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_helpline_user_id ON public.helpline(user_id);
