-- Allow customer (role = user) and admin-panel accounts to share email/mobile.
-- Uniqueness is enforced per role group, not globally across the users table.

BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_mobile_key;

-- Admin panel roles: email/mobile unique among admins only
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_admin_email
  ON public.users (LOWER(email))
  WHERE role IN (
      'admin'::public.user_role,
      'super_admin'::public.user_role,
      'manager'::public.user_role,
      'accountant'::public.user_role
    )
    AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_admin_mobile
  ON public.users (mobile)
  WHERE role IN (
      'admin'::public.user_role,
      'super_admin'::public.user_role,
      'manager'::public.user_role,
      'accountant'::public.user_role
    );

-- App customers: keep email/mobile unique among customers (login / OTP)
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_customer_email
  ON public.users (LOWER(email))
  WHERE role = 'user'::public.user_role
    AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_customer_mobile
  ON public.users (mobile)
  WHERE role = 'user'::public.user_role;

COMMIT;
