-- ============================================================
-- MIGRATION 048: FAQs CMS
-- Tables: faqs
-- Public: GET /api/common/faq (and /api/common/userfaq)
-- Admin: CRUD /api/admin/faqs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.faqs (
    id           SERIAL PRIMARY KEY,
    question     TEXT NOT NULL,
    answer       TEXT NOT NULL,
    status       BOOLEAN NOT NULL DEFAULT true,
    sequence     INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_faqs_sequence
    ON public.faqs (sequence ASC, id ASC);

INSERT INTO public.faqs (question, answer, status, sequence)
SELECT v.question, v.answer, true, v.sequence
FROM (
    VALUES
        (
            'How do I place an order for Wash by Kilo?',
            $a$Simply download the MetroGini app and register using your PIN code, address and phone number.
Select the number of garments you wish to send, choose your preferred pickup date and slot, and pay the applicable advance amount. Your order will then be placed.$a$,
            1
        ),
        (
            'How does the Wash by Kilo service work, and where are my clothes processed?',
            $a$Your clothes are processed by trained and experienced MetroGini laundry partners within your zone.
Our partners use professional-grade washing machines and follow defined processes for sorting, tagging and packaging. MetroGini oversees the service to ensure a consistent customer experience.$a$,
            2
        ),
        (
            'When will my clothes be picked up and delivered? Can I reschedule my pickup?',
            $a$Your clothes will be picked up according to the slot selected while placing your order.
The delivery schedule is automatically assigned and displayed at the time of booking. Delivery will be scheduled within 96 hours of pickup.
If your pickup slot does not suit you, you can change it, and the delivery schedule will be adjusted accordingly. You can also reschedule your booking within 4 hours of placing the order.
For assistance, you can contact us through the WhatsApp option available on the MetroGini app or website.$a$,
            3
        ),
        (
            'Why is there a minimum of 10 garments? What is the minimum billing amount?',
            $a$To keep our pickup service affordable and efficient, the minimum order is 10 garments or 3 kg, as applicable.
You may hand over fewer than 10 garments after booking; however, the minimum billing of 3 kg will still apply.
Therefore, the minimum billing amount is ₹630 + GST.$a$,
            4
        ),
        (
            'How do I know the weight of my clothes when placing an order?',
            $a$Garments can vary significantly in weight, so estimating the exact weight at the time of booking can be difficult.
For convenience, we therefore ask you to select the number of garments rather than their weight.
As a general guideline, a standard 10-garment order typically weighs around 3–4 kg, depending on the type and combination of garments.

A load of 3–5 kg (approx. 10–13 items) ranges from Rs. 630 to Rs. 1,050.
A load of 5–7 kg (approx. 14–18 items) ranges from Rs. 1,050 to Rs. 1,470.
A load of 8–11 kg (approx. 19–25 items) ranges from Rs. 1,680 to Rs. 2,310.
Any load above 11 kg (25+ items) starts from Rs. 2,310.

The above figures are approximate. Your final bill will be based on the actual weight of your order.$a$,
            5
        ),
        (
            'Approximately how much does each garment weigh?',
            $a$The weight of a garment varies depending on its material, size and construction. The following figures are provided as a general reference:

Ladies Kurti: ~0.20 kg (5 items/kg), Shirt / Pyjama: ~0.25 kg (4 items/kg), Shorts: ~0.30 kg (3 items/kg), T-Shirt: ~0.35 kg (3 items/kg), Track Pant: ~0.40 kg (2 items/kg), Cotton Trouser: ~0.45 kg (2 items/kg), Jeans: ~0.55 kg (2 items/kg), Kids Frock: ~0.60 kg (1 item/kg), Dungaree / Jump Suit: ~0.75 kg (1 item/kg)

These are approximate figures and actual garment weights may vary.$a$,
            6
        ),
        (
            'Are my clothes washed separately? Are whites washed separately?',
            $a$Your garments are processed in 10 kg batches with appropriate care to maintain cleaning quality and operational efficiency.
White and coloured garments are always washed separately.
Your order is also handled using baggage and washing tags to help ensure proper identification throughout the process.$a$,
            7
        ),
        (
            'How does MetroGini handle fabric care and stains?',
            $a$We take care of your garments using fabric-friendly detergents and softeners at our laundry partner locations.
If you have a stain that requires attention, please mention it in the Special Instructions section while placing your order. Stain treatment may involve an additional charge based on the fabric type, stain type and size.
If our team identifies a stain during sorting, we will share the stain photograph and applicable treatment cost with you through the MetroGini app, SMS, WhatsApp or email and seek your approval before proceeding.
Please note that while we make every effort to remove stains, complete removal cannot always be guaranteed. Specialised stain-treatment charges will apply once the treatment has been approved, irrespective of the final result.$a$,
            8
        ),
        (
            'Which items are not accepted under Wash by Kilo?',
            $a$The following items are currently not accepted under Wash by Kilo:
Undergarments, Socks, Sarees, Blazers, Suits, Delicate or embroidered garments, Very expensive or fragile garments$a$,
            9
        ),
        (
            'When do I need to make the payment?',
            $a$After pickup, your clothes are weighed and checked by the laundry partner.
Your final weight and applicable final price will be communicated through the MetroGini app, SMS, WhatsApp or email within 12–16 hours of pickup.
The final payment must be completed one day before the scheduled delivery date.$a$,
            10
        ),
        (
            'How do I know whether my clothes are ready as per schedule?',
            $a$Your delivery will be made according to the schedule provided at the time of booking.
If there is any delay, we will notify you through WhatsApp or in-app messaging.
You can also contact us through WhatsApp using your registered mobile number and order number, and our team will share your scheduled delivery window.$a$,
            11
        ),
        (
            'What happens if my clothes are missing or damaged?',
            $a$Every order is handled using baggage and washing tags to help identify and track your garments during processing.
If you notice any missing, mixed-up or damaged garment, please contact us through WhatsApp with your order details. Our team will review the issue and assist you with the resolution.
For further details, please refer to the MetroGini Terms of Use and Service.$a$,
            12
        )
) AS v(question, answer, sequence)
WHERE NOT EXISTS (SELECT 1 FROM public.faqs);
