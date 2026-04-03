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
