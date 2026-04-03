-- ============================================================
-- MIGRATION 002: Vendors
-- Tables: vendors
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendors (
    id                      BIGSERIAL PRIMARY KEY,
    owner_contact_name      VARCHAR(255),
    mobile_number           VARCHAR(20),
    email                   VARCHAR(255) UNIQUE,
    aadhar_number           VARCHAR(20),
    pan_card_number         VARCHAR(20),
    laundry_shop_name       VARCHAR(255),
    shop_address            TEXT,
    gst_number              VARCHAR(50),
    account_holder_name     VARCHAR(255),
    bank_name               VARCHAR(255),
    account_number          VARCHAR(50),
    ifsc_code               VARCHAR(20),
    image                   TEXT,
    pincode                 TEXT,
    otp                     VARCHAR(10),
    otp_expire              TIMESTAMP,
    status                  VARCHAR(50) DEFAULT 'pending',
    is_active               BOOLEAN DEFAULT true,
    is_terms_and_condition  BOOLEAN DEFAULT false,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
