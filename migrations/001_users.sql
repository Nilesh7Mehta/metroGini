-- ============================================================
-- MIGRATION 001: Users
-- Tables: users, user_address_details, refresh_tokens
-- ============================================================

CREATE TYPE IF NOT EXISTS public.user_role AS ENUM ('user', 'admin');

CREATE TABLE IF NOT EXISTS public.users (
    id                  BIGSERIAL PRIMARY KEY,
    mobile              VARCHAR(15) NOT NULL UNIQUE,
    full_name           VARCHAR(100),
    email               VARCHAR(150) UNIQUE,
    gender              VARCHAR(20),
    alternate_phone     VARCHAR(15),
    profile_image       VARCHAR(255),
    otp                 VARCHAR(4),
    otp_expires_at      TIMESTAMP,
    otp_attempts        INTEGER DEFAULT 0,
    is_mobile_verified  BOOLEAN DEFAULT false,
    profile_completed   BOOLEAN DEFAULT false,
    terms_and_condition BOOLEAN DEFAULT false,
    push_notification   BOOLEAN DEFAULT true,
    role                public.user_role DEFAULT 'user',
    user_password       VARCHAR(255),
    status              VARCHAR(20) DEFAULT 'active',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT gender_check CHECK (gender IN ('male', 'female', 'other')),
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'blocked'))
);

CREATE TABLE IF NOT EXISTS public.user_address_details (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL,
    address_type     VARCHAR(20) NOT NULL,
    complete_address TEXT NOT NULL,
    floor            VARCHAR(100),
    landmark         VARCHAR(255),
    receiver_name    VARCHAR(100) NOT NULL,
    contact_number   VARCHAR(15) NOT NULL,
    latitude         DOUBLE PRECISION NOT NULL,
    longitude        DOUBLE PRECISION NOT NULL,
    pincode          VARCHAR(10),
    is_selected      BOOLEAN DEFAULT false,
    is_active        BOOLEAN DEFAULT true,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_address_details_address_type_check CHECK (address_type IN ('home', 'work', 'institute')),
    CONSTRAINT fk_address_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    token      TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_address_user_id    ON public.user_address_details(user_id);
CREATE INDEX IF NOT EXISTS idx_address_selected   ON public.user_address_details(user_id, is_selected);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user  ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON public.refresh_tokens(token);
