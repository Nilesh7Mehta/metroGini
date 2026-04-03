-- ============================================================
-- MIGRATION 006: Orders, Payments, Order Items
-- Tables: orders, payments, order_items
-- Run after: 001_users.sql, 002_vendors.sql, 003_riders.sql,
--            004_services.sql, 005_coupons.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER,
    service_id           INTEGER,
    service_type_id      INTEGER,
    clothes_count        INTEGER,
    estimated_weight_min NUMERIC(10,2),
    estimated_weight_max NUMERIC(10,2),
    actual_weight        NUMERIC(10,2),
    actual_clothes_count INTEGER DEFAULT 0,
    base_price_per_kg    NUMERIC(10,2),
    extra_price_per_kg   NUMERIC(10,2),
    flat_fee             NUMERIC(10,2),
    peak_extra_charge    NUMERIC(10,2),
    estimated_total      NUMERIC(10,2),
    final_total          NUMERIC(10,2),
    pickup_date          DATE,
    pickup_slot_id       INTEGER,
    delivery_date        DATE,
    delivery_slot_id     INTEGER,
    address_id           INTEGER,
    vendor_id            INTEGER,
    assigned_rider_id    INTEGER,
    applied_coupon_id    INTEGER,
    status               VARCHAR(30),
    payment_status       VARCHAR(30),
    pickup_otp           VARCHAR(6),
    delivery_otp         VARCHAR(6),
    otp_generated_at     TIMESTAMP,
    otp_verified         BOOLEAN DEFAULT false,
    vendor_received_at   DATE,
    delivered_at         DATE,
    created_at           TIMESTAMP DEFAULT now(),
    updated_at           TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_orders_user         FOREIGN KEY (user_id)          REFERENCES public.users(id)                ON DELETE SET NULL,
    CONSTRAINT fk_orders_service      FOREIGN KEY (service_id)       REFERENCES public.services(id)             ON DELETE SET NULL,
    CONSTRAINT fk_orders_service_type FOREIGN KEY (service_type_id)  REFERENCES public.service_types(id)        ON DELETE SET NULL,
    CONSTRAINT fk_orders_pickup_slot  FOREIGN KEY (pickup_slot_id)   REFERENCES public.time_slots(id)           ON DELETE SET NULL,
    CONSTRAINT fk_orders_delivery_slot FOREIGN KEY (delivery_slot_id) REFERENCES public.time_slots(id)          ON DELETE SET NULL,
    CONSTRAINT fk_orders_address      FOREIGN KEY (address_id)       REFERENCES public.user_address_details(id) ON DELETE SET NULL,
    CONSTRAINT fk_orders_vendor       FOREIGN KEY (vendor_id)        REFERENCES public.vendors(id)              ON DELETE SET NULL,
    CONSTRAINT fk_orders_rider        FOREIGN KEY (assigned_rider_id) REFERENCES public.riders(id)              ON DELETE SET NULL,
    CONSTRAINT fk_orders_coupon       FOREIGN KEY (applied_coupon_id) REFERENCES public.coupons(id)             ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
    id             SERIAL PRIMARY KEY,
    order_id       INTEGER,
    amount         NUMERIC(10,2) NOT NULL,
    payment_type   VARCHAR(20) NOT NULL,
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    status         VARCHAR(20) DEFAULT 'pending',
    paid_at        TIMESTAMP,
    created_at     TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id         SERIAL PRIMARY KEY,
    order_id   INTEGER NOT NULL,
    category   VARCHAR(50) NOT NULL,
    quantity   INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor_id      ON public.orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_rider_id       ON public.orders(assigned_rider_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date    ON public.orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date  ON public.orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id      ON public.orders(applied_coupon_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id     ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_type         ON public.payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON public.order_items(order_id);
