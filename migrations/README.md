# Migrations

Run in order. Each file depends on the ones before it.

| File | Tables | Depends On |
|------|--------|------------|
| 001_users.sql | users, user_address_details, refresh_tokens | — |
| 002_vendors.sql | vendors | — |
| 003_riders.sql | shifts, riders, rider_helpline | — |
| 004_services.sql | services, service_types, time_slots, cities, banners | — |
| 005_coupons.sql | coupons, coupon_usages | 001 |
| 006_orders.sql | orders, payments, order_items | 001, 002, 003, 004, 005 |
| 007_order_events.sql | order_cancellations, order_reports | 006 |
| 008_notifications.sql | notifications | — (polymorphic) |
| 009_helpline.sql | helpline | 001 |
| 010_vendor_auth.sql | vendors (dob, password columns) | 002 |
| 011_support_requests.sql | support_requests (unified need-help) | 001, 002, 003 |
| 012_order_timestamps.sql | orders (lifecycle TIMESTAMP columns) | 006 |
| 014_vendor_merchant_profile.sql | vendors (merchant profile, equipment, capacity) | 002, 010 |
| 015_pincode_groups.sql | pincode_groups | 004 |
| 016_pincodes.sql | pincodes | 015 |
| 017_laundry_group_shift_schedule.sql | laundry_group_shift_schedule | 003, 015, laundries |
| 018_rider_group_shift_schedule.sql | rider_group_shift_schedule | 003, 015 |
| 019_laundry_slot_capacity.sql | laundry_slot_capacity | 003, laundries |
| 023_order_stain_columns.sql | orders (is_stained, stain_image, vendor_request_amount) | 006 |
| 026_order_vendor_revenue_columns.sql | orders (vendor_revenue, vendor_request_markup) | 023 |
| 027_order_stain_images.sql | orders (stain_image → stain_images JSONB) | 023 |
| 028_vendor_per_kg.sql | vendors (vendor_per_kg_amount) | 002 |
| 029_coupon_maximum_amount.sql | coupons (maximum_amount_value) | 005 |
| 031_order_vendor_amount_per_kg.sql | orders (vendor_amount_per_kg) | 028 |
| 032_vendor_payout_batches.sql | vendor_payout_batches; orders (vendor_payout_batch_id) | 031, 015 |
| 033_pincode_groups_city_id.sql | pincode_groups (city_id) | 004, 015 |
| 034_order_damage_columns.sql | orders (is_damaged, damage_count, damage_images) | 027 |
| 033_order_special_instructions.sql | orders (pickup_special_instruction, delivery_special_instruction) | 006 |
| 036_support_requests_resolution_note.sql | support_requests (resolution_note) | 011 |
