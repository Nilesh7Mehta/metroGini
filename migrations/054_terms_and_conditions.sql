-- ============================================================
-- MIGRATION 054: Terms and Conditions CMS
-- Public: GET /api/common/terms-and-conditions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.terms_and_conditions (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(150) NOT NULL,
    subtitle     VARCHAR(255),
    notice_title VARCHAR(150),
    notice_text  TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.terms_and_conditions_sections (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    body         TEXT NOT NULL,
    sequence     INTEGER NOT NULL DEFAULT 1,
    status       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.terms_and_conditions_consents (
    id           SERIAL PRIMARY KEY,
    body         TEXT NOT NULL,
    sequence     INTEGER NOT NULL DEFAULT 1,
    status       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_terms_sections_sequence
    ON public.terms_and_conditions_sections (sequence ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_terms_consents_sequence
    ON public.terms_and_conditions_consents (sequence ASC, id ASC);

INSERT INTO public.terms_and_conditions (title, subtitle, notice_title, notice_text)
SELECT
    'Terms & Conditions',
    'First-time customer agreement',
    'Important Notice',
    'This agreement is non-cancellable once accepted. Please read carefully before proceeding.'
WHERE NOT EXISTS (SELECT 1 FROM public.terms_and_conditions);

INSERT INTO public.terms_and_conditions_sections (title, body, status, sequence)
SELECT v.title, v.body, true, v.sequence
FROM (
    VALUES
        (
            '1. Service Agreement',
            $b$By using our laundry services, you agree to our terms and conditions. We provide professional laundry and dry cleaning services with care and attention to detail.$b$,
            1
        ),
        (
            '2. Liability and Indemnification',
            $b$The customer agrees to indemnify and hold harmless the service provider from any claims, damages, or losses arising from:
• Items with undeclared stains, damages, or defects
• Delicate fabrics requiring special care not disclosed
• Items with color bleeding tendencies
• Valuable items left in pockets$b$,
            2
        ),
        (
            '3. Care and Processing',
            $b$We exercise reasonable care in processing your garments. However, some risks are inherent in the cleaning process. We are not liable for:
• Pre-existing damage not disclosed at time of pickup
• Normal wear and tear acceleration in older garments
• Color bleeding from non-colorfast fabrics
• Shrinkage in garments prone to such damage$b$,
            3
        ),
        (
            '4. Customer Responsibilities',
            $b$The customer is responsible for:
• Declaring all stains and their nature
• Removing all items from pockets
• Informing about delicate or special care items
• Providing accurate contact information$b$,
            4
        ),
        (
            '5. Limitation of Liability',
            $b$Our maximum liability for any garment is limited to 10 times the cleaning charge or the current used value of the garment, whichever is less. Claims must be made within 7 days of delivery.$b$,
            5
        ),
        (
            '6. Payment Terms',
            $b$Final pricing is determined after actual weighing. Payment is due upon notification. Orders will be held until payment is completed.$b$,
            6
        ),
        (
            '7. Force majeure',
            $b$We are not liable for delays or damages caused by circumstances beyond our control including but not limited to natural disasters, strikes, or government regulations.$b$,
            7
        )
) AS v(title, body, sequence)
WHERE NOT EXISTS (SELECT 1 FROM public.terms_and_conditions_sections);

INSERT INTO public.terms_and_conditions_consents (body, status, sequence)
SELECT v.body, true, v.sequence
FROM (
    VALUES
        (
            $c$I have read and understood all the terms and conditions mentioned above.$c$,
            1
        ),
        (
            $c$I agree to all terms and conditions and understand that this agreement is non-cancellable. I indemnify the service provider from any claims arising from undisclosed damages or special care requirements.$c$,
            2
        )
) AS v(body, sequence)
WHERE NOT EXISTS (SELECT 1 FROM public.terms_and_conditions_consents);
