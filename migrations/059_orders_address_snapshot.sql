-- ============================================================
-- MIGRATION 059: Freeze delivery address on orders
-- Alters: orders
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS address_snapshot JSONB;

COMMENT ON COLUMN public.orders.address_snapshot IS
  'Frozen copy of user_address_details at booking (type, address, floor, landmark, receiver, contact, lat/lng, pincode)';

-- Backfill from current address rows where possible
UPDATE public.orders o
SET address_snapshot = jsonb_build_object(
  'address_type', uad.address_type,
  'complete_address', uad.complete_address,
  'floor', uad.floor,
  'landmark', uad.landmark,
  'receiver_name', uad.receiver_name,
  'contact_number', uad.contact_number,
  'latitude', uad.latitude,
  'longitude', uad.longitude,
  'pincode', uad.pincode
)
FROM public.user_address_details uad
WHERE o.address_id = uad.id
  AND o.address_snapshot IS NULL;
