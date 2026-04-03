-- ============================================================
-- MIGRATION 005: Coupons
-- Tables: coupons, coupon_usages
-- Run after: 001_users.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coupons (
    id                   SERIAL PRIMARY KEY,
    coupon_code          VARCHAR(50) NOT NULL UNIQUE,
    discount_type        VARCHAR(20) NOT NULL,
    discount_value       NUMERIC(10,2) NOT NULL,
    minimum_amount_value NUMERIC(10,2) DEFAULT 0,
    start_date           TIMESTAMP NOT NULL,
    end_date             TIMESTAMP NOT NULL,
    is_active            BOOLEAN DEFAULT true,
    per_user_limit       INTEGER DEFAULT 1,
    usage_limit          INTEGER,
    used_count           INTEGER DEFAULT 0,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT coupons_discount_type_check CHECK (discount_type IN ('percentage', 'flat'))
);

CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id          SERIAL PRIMARY KEY,
    coupon_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    order_id    INTEGER,
    is_used     BOOLEAN DEFAULT false,
    expiry_date TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_coupon_usages_coupon FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_usages_user   FOREIGN KEY (user_id)   REFERENCES public.users(id)   ON DELETE CASCADE,
    CONSTRAINT unique_coupon_user_order UNIQUE (coupon_id, user_id, order_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupon_usages_user_id ON public.coupon_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon  ON public.coupon_usages(coupon_id);

-- Prevents duplicate NULL order_id rows bypassing the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_usages_no_order
  ON public.coupon_usages(coupon_id, user_id)
  WHERE order_id IS NULL;
