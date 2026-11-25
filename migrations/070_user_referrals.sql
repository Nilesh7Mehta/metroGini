-- ============================================================
-- MIGRATION 070: User referrals
-- Personal refer codes (USER01…) + shared REFERRALREWARD grants.
-- Run after: 005_coupons.sql, 001_users.sql, 006_orders.sql, 066
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS referred_by_user_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_referred_by_user'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_referred_by_user
      FOREIGN KEY (referred_by_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_referred_by_user_id
  ON public.orders (referred_by_user_id);

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS is_referral_reward BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_referral_code BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_referral_code_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS referrer_user_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_coupons_referrer_user'
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT fk_coupons_referrer_user
      FOREIGN KEY (referrer_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.coupons.is_referral_reward IS
  'Shared reward coupon (e.g. REFERRALREWARD). Requires coupon_usages grant to redeem.';
COMMENT ON COLUMN public.coupons.is_referral_code IS
  'Personal shareable refer coupon (USER01). Applied by friends for discount.';
COMMENT ON COLUMN public.coupons.is_referral_code_template IS
  'Admin-editable template; discount copied / overlaid onto personal USER## codes.';

-- Only one active shared reward coupon and one active template
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_one_referral_reward
  ON public.coupons ((true))
  WHERE is_referral_reward = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_one_referral_code_template
  ON public.coupons ((true))
  WHERE is_referral_code_template = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_referrer_user_referral_code
  ON public.coupons (referrer_user_id)
  WHERE is_referral_code = true AND referrer_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id                BIGSERIAL PRIMARY KEY,
  referrer_user_id  BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id  BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id          BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  coupon_usage_id   BIGINT REFERENCES public.coupon_usages(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_referral_rewards_referred_user UNIQUE (referred_user_id),
  CONSTRAINT uq_referral_rewards_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
  ON public.referral_rewards (referrer_user_id);

-- Seed shared reward coupon (25% — admin can edit later)
INSERT INTO public.coupons (
  coupon_code, discount_type, discount_value,
  minimum_amount_value, maximum_amount_value,
  start_date, end_date, is_active,
  per_user_limit, usage_limit,
  is_referral_reward, is_referral_code, is_referral_code_template
)
SELECT
  'REFERRALREWARD', 'percentage', 25,
  0, NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 years', true,
  NULL, NULL,
  true, false, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupons WHERE UPPER(coupon_code) = 'REFERRALREWARD'
);

UPDATE public.coupons
SET is_referral_reward = true,
    discount_type = COALESCE(discount_type, 'percentage'),
    is_active = true,
    per_user_limit = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE UPPER(coupon_code) = 'REFERRALREWARD'
  AND is_referral_reward = false;

-- Seed template for personal USER## codes (30% — admin can edit later)
INSERT INTO public.coupons (
  coupon_code, discount_type, discount_value,
  minimum_amount_value, maximum_amount_value,
  start_date, end_date, is_active,
  per_user_limit, usage_limit,
  is_referral_reward, is_referral_code, is_referral_code_template
)
SELECT
  'REFERRAL_CODE_TEMPLATE', 'percentage', 30,
  0, NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 years', true,
  1, NULL,
  false, false, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.coupons WHERE UPPER(coupon_code) = 'REFERRAL_CODE_TEMPLATE'
);

UPDATE public.coupons
SET is_referral_code_template = true,
    discount_type = COALESCE(discount_type, 'percentage'),
    is_active = true,
    updated_at = CURRENT_TIMESTAMP
WHERE UPPER(coupon_code) = 'REFERRAL_CODE_TEMPLATE'
  AND is_referral_code_template = false;
