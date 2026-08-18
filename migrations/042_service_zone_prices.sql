-- ============================================================
-- MIGRATION 042: Service zone (pincode group) prices
-- Tables: service_zone_prices
-- Run after: 004_services.sql, 015_pincode_groups.sql
-- Seeds current services.base_price_per_kg into every zone so
-- behaviour is unchanged until admin sets zone-specific rates.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_zone_prices (
    id                  BIGSERIAL PRIMARY KEY,
    service_id          INTEGER        NOT NULL,
    pincode_group_id    BIGINT         NOT NULL,
    base_price_per_kg   NUMERIC(10,2)  NOT NULL,
    created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_szp_price_non_negative CHECK (base_price_per_kg >= 0),
    CONSTRAINT uq_szp_service_zone UNIQUE (service_id, pincode_group_id),
    CONSTRAINT fk_szp_service
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE,
    CONSTRAINT fk_szp_pincode_group
      FOREIGN KEY (pincode_group_id) REFERENCES public.pincode_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_szp_pincode_group
  ON public.service_zone_prices (pincode_group_id);

INSERT INTO public.service_zone_prices (service_id, pincode_group_id, base_price_per_kg)
SELECT s.id, pg.id, s.base_price_per_kg
FROM public.services s
CROSS JOIN public.pincode_groups pg
ON CONFLICT (service_id, pincode_group_id) DO NOTHING;
