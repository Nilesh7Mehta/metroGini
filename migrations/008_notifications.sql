-- ============================================================
-- MIGRATION 008: Notifications
-- Tables: notifications
-- Polymorphic: identity_id + role covers users, vendors, riders
-- No FK on identity_id by design (polymorphic relation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id             SERIAL PRIMARY KEY,
    identity_id    BIGINT NOT NULL,
    role           VARCHAR(20) NOT NULL,
    title          VARCHAR(150) NOT NULL,
    message        TEXT NOT NULL,
    reference_type VARCHAR(50),
    reference_id   INTEGER,
    is_read        BOOLEAN DEFAULT false,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_identity  ON public.notifications(identity_id, role);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON public.notifications(reference_type, reference_id);
