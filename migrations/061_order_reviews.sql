-- ============================================================
-- MIGRATION 061: Order reviews
-- One review per order, submitted by the customer after delivery.
-- vendor_id / rider_id are copied from the order at review time.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_reviews (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL,
    vendor_id    INTEGER,
    rider_id     INTEGER,
    rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text  TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_reviews_order  FOREIGN KEY (order_id)  REFERENCES public.orders(id)  ON DELETE CASCADE,
    CONSTRAINT fk_order_reviews_user   FOREIGN KEY (user_id)   REFERENCES public.users(id)   ON DELETE CASCADE,
    CONSTRAINT fk_order_reviews_vendor FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL,
    CONSTRAINT fk_order_reviews_rider  FOREIGN KEY (rider_id)  REFERENCES public.riders(id)  ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_reviews_user_id   ON public.order_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_vendor_id ON public.order_reviews(vendor_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_rider_id  ON public.order_reviews(rider_id);
