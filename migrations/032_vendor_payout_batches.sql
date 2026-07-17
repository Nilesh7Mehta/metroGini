-- ============================================================
-- MIGRATION 032: Vendor payout batches (real admin payout)
-- Tables: vendor_payout_batches
-- Alters: orders (vendor_payout_batch_id)
-- Run after: 031_order_vendor_amount_per_kg.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendor_payout_batches (
    id                 SERIAL PRIMARY KEY,
    batch_code         VARCHAR(40) UNIQUE NOT NULL,
    vendor_id          INTEGER NOT NULL,
    pincode_group_id   INTEGER NOT NULL,
    week_start         DATE NOT NULL,
    week_end           DATE NOT NULL,
    total_orders       INTEGER NOT NULL DEFAULT 0,
    total_kg           NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_revenue      NUMERIC(12,2) NOT NULL DEFAULT 0,
    gst_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    payable_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_status     VARCHAR(30) NOT NULL DEFAULT 'invoice_not_generated',
    invoice_id         VARCHAR(64),
    invoice_image      TEXT,
    transaction_id     VARCHAR(255),
    payment_date       DATE,
    paid_at            TIMESTAMP,
    paid_by            INTEGER,
    created_at         TIMESTAMP DEFAULT now(),
    updated_at         TIMESTAMP DEFAULT now(),
    CONSTRAINT fk_vpb_vendor
      FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vpb_pincode_group
      FOREIGN KEY (pincode_group_id) REFERENCES public.pincode_groups(id) ON DELETE RESTRICT,
    CONSTRAINT uq_vpb_vendor_zone_week
      UNIQUE (vendor_id, pincode_group_id, week_start),
    CONSTRAINT chk_vpb_payment_status
      CHECK (payment_status IN ('invoice_not_generated', 'pending', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_vpb_vendor_id ON public.vendor_payout_batches(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vpb_pincode_group_id ON public.vendor_payout_batches(pincode_group_id);
CREATE INDEX IF NOT EXISTS idx_vpb_week_start ON public.vendor_payout_batches(week_start);
CREATE INDEX IF NOT EXISTS idx_vpb_payment_status ON public.vendor_payout_batches(payment_status);

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS vendor_payout_batch_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orders_vendor_payout_batch'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_vendor_payout_batch
      FOREIGN KEY (vendor_payout_batch_id)
      REFERENCES public.vendor_payout_batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_vendor_payout_batch_id
  ON public.orders(vendor_payout_batch_id);

CREATE INDEX IF NOT EXISTS idx_orders_ready_for_delivery_at
  ON public.orders(ready_for_delivery_at);
