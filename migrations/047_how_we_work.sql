-- ============================================================
-- MIGRATION 047: How We Work CMS items
-- Tables: how_we_work
-- ============================================================

CREATE TABLE IF NOT EXISTS public.how_we_work (
    id           SERIAL PRIMARY KEY,
    heading      VARCHAR(150) NOT NULL,
    image        TEXT,
    status       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.how_we_work (heading, image, status)
SELECT v.heading, v.image, true
FROM (
    VALUES
        ('Book Your Pickup in Seconds', 'uploads/how-we-work/book-pickup.png'),
        ('Handled by Trusted Laundry Agents', 'uploads/how-we-work/rider-pickup.png'),
        ('Carefully Processed with Quality Standards', 'uploads/how-we-work/processing.png'),
        ('Fresh Laundry Delivered to Your Door', 'uploads/how-we-work/delivery.png')
) AS v(heading, image)
WHERE NOT EXISTS (SELECT 1 FROM public.how_we_work);
