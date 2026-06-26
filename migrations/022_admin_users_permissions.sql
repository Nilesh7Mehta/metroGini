-- Same users table: app customers (role = user) vs admin panel staff (admin, accountant, ...)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.users DROP COLUMN IF EXISTS admin_role;

-- admin role = full access, stored as empty permissions object
UPDATE public.users
SET permissions = '{}'::jsonb
WHERE role::text IN ('admin', 'super_admin');
