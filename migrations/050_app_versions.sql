-- ============================================================
-- MIGRATION 050: App versions (user / rider apps)
-- Public: GET /api/common/app-versions?app_for=
-- Admin: PUT /api/admin/app-versions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_versions (
    id         SERIAL PRIMARY KEY,
    app_for    VARCHAR(20) NOT NULL,
    type       VARCHAR(20) NOT NULL,
    version    VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    app_url    TEXT,
    status     VARCHAR(30) NOT NULL DEFAULT 'optional',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_app_versions_app_for_type UNIQUE (app_for, type),
    CONSTRAINT chk_app_versions_app_for CHECK (app_for IN ('user', 'rider')),
    CONSTRAINT chk_app_versions_type CHECK (type IN ('android', 'ios'))
);

INSERT INTO public.app_versions (app_for, type, version, app_url, status) VALUES
  ('user', 'android', '1.0.0', '', 'optional'),
  ('user', 'ios', '1.0.0', '', 'optional'),
  ('rider', 'android', '1.0.0', '', 'optional'),
  ('rider', 'ios', '1.0.0', '', 'optional')
ON CONFLICT (app_for, type) DO NOTHING;
