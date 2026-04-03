-- ============================================================
-- MIGRATION 007: Order Events
-- Tables: order_cancellations, order_reports
-- Run after: 006_orders.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_cancellations (
    id                 SERIAL PRIMARY KEY,
    order_id           INTEGER NOT NULL,
    user_id            INTEGER NOT NULL,
    reason_type        VARCHAR(50) NOT NULL,
    reason_description TEXT,
    cancelled_at       TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_order_cancellations_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_cancellations_user  FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.order_reports (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    issue_type   VARCHAR(20) NOT NULL,
    issue_reason VARCHAR(100) NOT NULL,
    description  TEXT,
    status       VARCHAR(20) DEFAULT 'open',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_reports_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_reports_user  FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_order_cancel_order  ON public.order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_cancel_user   ON public.order_cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reports_order_id ON public.order_reports(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reports_user_id  ON public.order_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reports_status   ON public.order_reports(status);
