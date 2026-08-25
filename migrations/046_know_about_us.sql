-- ============================================================
-- MIGRATION 046: Know About Us CMS items
-- Tables: know_about_us
-- ============================================================

CREATE TABLE IF NOT EXISTS public.know_about_us (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(150) NOT NULL,
    description  TEXT NOT NULL,
    image        TEXT,
    status       BOOLEAN NOT NULL DEFAULT true,
    sequence     INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_know_about_us_sequence
    ON public.know_about_us (sequence ASC, id ASC);

INSERT INTO public.know_about_us (title, description, image, status, sequence)
SELECT v.title, v.description, v.image, true, v.sequence
FROM (
    VALUES
        (
            'Wash By Kilo',
            'No complicated pricing. Just give us your daily laundry and we''ll handle it based on weight.',
            'uploads/know-about-us/wash-by-kilo.png',
            1
        ),
        (
            'Doorstep Pickup & Delivery',
            'Schedule at your own convenience, freshly ready-to-wear clothes delivered on time.',
            'uploads/know-about-us/pick-up-drop.png',
            2
        ),
        (
            'High Hygiene Standards',
            'T-shirts, jeans, office wear all your everyday laundry handled professionally.',
            'uploads/know-about-us/cloth-hygine.png',
            3
        ),
        (
            'Save Time Every Week',
            'Clothes returned clean, perfectly ironed, neatly folded, and Packed.',
            'uploads/know-about-us/save-time.png',
            4
        )
) AS v(title, description, image, sequence)
WHERE NOT EXISTS (SELECT 1 FROM public.know_about_us);
