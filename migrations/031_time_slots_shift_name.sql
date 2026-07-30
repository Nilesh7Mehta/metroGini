-- Ensure time_slots has shift_name (used by admin UI + pickup shift mapping)
ALTER TABLE public.time_slots
  ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50);
