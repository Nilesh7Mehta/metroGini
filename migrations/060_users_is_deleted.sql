-- Soft-delete flag for app customers. Row stays so the same mobile can log in again.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
