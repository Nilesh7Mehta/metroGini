-- ============================================================
-- MIGRATION 074: Personal referral codes → referral_codes table
-- Coupons keeps only promos + REFERRAL_CODE_TEMPLATE + REFERRALREWARD.
-- Run after: 070_user_referrals.sql, 071
-- ============================================================

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code        VARCHAR(40) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_referral_codes_user UNIQUE (user_id),
  CONSTRAINT uq_referral_codes_code UNIQUE (code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_codes_code_upper
  ON public.referral_codes (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id
  ON public.referral_codes (user_id);

COMMENT ON TABLE public.referral_codes IS
  'Personal shareable referral codes (e.g. UZAIRUE9B). Discount % comes from REFERRAL_CODE_TEMPLATE coupon.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS applied_referral_code_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_applied_referral_code'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_applied_referral_code
      FOREIGN KEY (applied_referral_code_id)
      REFERENCES public.referral_codes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_applied_referral_code_id
  ON public.orders (applied_referral_code_id);

-- Move existing personal referral coupons into referral_codes
INSERT INTO public.referral_codes (user_id, code, is_active, created_at, updated_at)
SELECT c.referrer_user_id,
       c.coupon_code,
       COALESCE(c.is_active, true),
       COALESCE(c.created_at, CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
FROM public.coupons c
WHERE c.is_referral_code = true
  AND c.referrer_user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Users who have referral_code mirror but no row yet
INSERT INTO public.referral_codes (user_id, code, is_active)
SELECT u.id, u.referral_code, true
FROM public.users u
WHERE u.referral_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.referral_codes rc WHERE rc.user_id = u.id
  )
ON CONFLICT (user_id) DO NOTHING;

-- Point orders that used a personal referral coupon at the new table + template
UPDATE public.orders o
SET applied_referral_code_id = rc.id,
    applied_coupon_id = tpl.id
FROM public.coupons c
JOIN public.referral_codes rc ON rc.user_id = c.referrer_user_id
CROSS JOIN LATERAL (
  SELECT id FROM public.coupons
  WHERE is_referral_code_template = true
  ORDER BY id ASC
  LIMIT 1
) tpl
WHERE o.applied_coupon_id = c.id
  AND c.is_referral_code = true;

-- Remove personal referral rows from coupons (ops list stays clean)
DELETE FROM public.coupon_usages
WHERE coupon_id IN (
  SELECT id FROM public.coupons WHERE is_referral_code = true
);

DELETE FROM public.coupons
WHERE is_referral_code = true;
