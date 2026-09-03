/**
 * Shared Gallabox catalog from gallabox_whatsapp_scenario_apis.txt
 * Used by Postman + single Excel generators.
 */
export const BASE = "https://api.metrogini.com";

export const SCENARIO_NAMES = {
  shared: "SHARED APIs (used by many scenarios)",
  1: "SCENARIO 1 — Promotion / New Customer → Booking",
  2: "SCENARIO 2 — App downloaded, no activity → re-engage",
  3: "SCENARIO 3 — Browsed / cart / prior chat, no booking",
  4: "SCENARIO 4 — Retention win-back (1 order, inactive 30 days)",
  5: "SCENARIO 5 — Day of pickup reminder + rider assigned",
  6: "SCENARIO 6 — Pickup successful",
  7: "SCENARIO 7 — Weight confirmation + Payment (PRIMARY)",
  8: "SCENARIO 8 — New / organic customer says Hi",
  9: "SCENARIO 9 — Existing customer + live order status",
  10: "SCENARIO 10 — Delayed pickup / delivery inquiry",
  11: "SCENARIO 11 — Damaged / missing / wrong garment",
  12: "SCENARIO 12 — Payment failed / double charged",
  13: "SCENARIO 13 — Negative feedback (1–2 stars)",
  14: "SCENARIO 14 — Human agent handoff",
  15: "SCENARIO 15 — Fallback / unrecognized",
};

const j = (obj) => JSON.stringify(obj, null, 2);

const api = (scenario, row) => ({
  scenario,
  ...row,
});

const sessionRes = {
  success: true,
  message: "WhatsApp session created",
  data: {
    access_token: "<jwt>",
    refresh_token: "<token>",
    expires_in: "7d",
    user_id: 12,
    customer_id: "MG-12",
    mobile: "9004186460",
    full_name: "Karthik",
    total_orders: 0,
    active_order_id: null,
    draft_order_id: null,
    has_app: false,
    default_address: null,
  },
};

const lookupRes = {
  success: true,
  message: "Customer found",
  data: {
    exists: true,
    user_id: 12,
    customer_id: "MG-12",
    full_name: "Karthik",
    total_orders: 1,
    active_order_id: 74,
    draft_order_id: null,
    has_app: true,
    default_address: {
      id: 3,
      complete_address: "A-204, Lotus Residency",
      pincode: "400058",
    },
  },
};

const pincodeCheckRes = {
  success: true,
  message: "Pincode is serviceable",
  data: {
    serviceable: true,
    pincode: "400058",
    pincode_group_id: 1,
    group_code: "MUM_WEST",
    has_vendor_slots: true,
    has_rider_slots: true,
    message: null,
  },
};

const bookPayRes = {
  message: "Payment successful. Order booked.",
  order_id: 74,
  assigned_vendor: 12,
  assigned_rider: 5,
  advance_paid: 0,
};

/** Catalog rows for Excel + Postman */
export const CATALOG = [
  // —— SHARED ——
  api(SCENARIO_NAMES.shared, {
    name: "WhatsApp session (no OTP)",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret (X-Gallabox-Secret)",
    request:
      j({ mobile: "9004186460" }) +
      "\n\nRequired: mobile\nOptional: none\nUse WhatsApp sender number. Do not ask user to type phone.",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES.shared, {
    name: "Customer lookup by mobile",
    method: "POST",
    path: "/api/whatsapp/customer/lookup",
    token: "Gallabox secret",
    request:
      j({ mobile: "9004186460" }) +
      "\n\nRequired: mobile\nOptional: none\nAlso: GET /api/whatsapp/customer/lookup?mobile=",
    response: j(lookupRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
  }),
  api(SCENARIO_NAMES.shared, {
    name: "Login or register (OTP fallback)",
    method: "POST",
    path: "/api/user/login-or-register",
    token: "No",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j({
      success: true,
      message: "OTP sent successfully",
      data: { id: 12, mobile: "9004186460" },
    }),
    postmanAuth: "none",
    body: { mobile: "{{mobile}}" },
  }),
  api(SCENARIO_NAMES.shared, {
    name: "Verify OTP (OTP fallback)",
    method: "POST",
    path: "/api/user/verify-otp",
    token: "No",
    request:
      j({ mobile: "9004186460", otp: "1234" }) +
      "\n\nRequired: mobile, otp\nOptional: none",
    response: j({
      success: true,
      data: { access_token: "<jwt>", refresh_token: "<token>", expires_in: "7d" },
    }),
    postmanAuth: "none",
    body: { mobile: "{{mobile}}", otp: "1234" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES.shared, {
    name: "Emit event to Gallabox (test outbound)",
    method: "POST",
    path: "/api/whatsapp/events/emit",
    token: "Gallabox secret",
    request:
      j({
        event: "pickup_day_reminder",
        order_id: 74,
        mobile: "9004186460",
        data: {},
      }) +
      "\n\nRequired: event\nOptional: order_id, mobile, data\nEvents: booking_confirmed, pickup_day_reminder, rider_assigned, pickup_completed, vendor_received, weight_confirmed, order.weight_confirmed, order.finalized, payment_received, out_for_delivery, delivered, delayed, cancelled",
    response: j({ success: true, message: "Event queued for order" }),
    postmanAuth: "whatsapp",
    body: {
      event: "pickup_day_reminder",
      order_id: "{{orderId}}",
      data: {},
    },
  }),

  // —— S1 ——
  api(SCENARIO_NAMES[1], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[1], {
    name: "Pincode check",
    method: "GET",
    path: "/api/common/pincode-check",
    token: "No",
    request:
      "Query required: pincode\nOptional: none\nIf serviceable=false → coming soon; stop.",
    response: j(pincodeCheckRes),
    postmanAuth: "none",
    query: [
      { key: "pincode", value: "{{pincode}}", description: "Required. 6-digit pincode" },
    ],
  }),
  api(SCENARIO_NAMES[1], {
    name: "List pincodes (alternate lookup)",
    method: "GET",
    path: "/api/common/pincodes",
    token: "No",
    request:
      "Query optional: pincode, pincode_group_id, serviceable (true/false)\nPrefer pincode-check for WhatsApp.",
    response: j({ success: true, data: [{ pincode: "400058", serviceable: true }] }),
    postmanAuth: "none",
    query: [
      { key: "pincode", value: "{{pincode}}", description: "Optional. Exact pincode", disabled: true },
      { key: "pincode_group_id", value: "1", description: "Optional", disabled: true },
      { key: "serviceable", value: "true", description: "Optional: true | false", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[1], {
    name: "Services (pricing / service_id)",
    method: "GET",
    path: "/api/common/services",
    token: "No",
    request:
      "Query optional: pincode OR pincode_group_id (or zone_id)\nIf omitted, default service prices.",
    response: j({
      success: true,
      data: { pincode_group_id: 1, services: [{ id: 1, name: "Wash by Kilo" }] },
    }),
    postmanAuth: "none",
    query: [
      { key: "pincode", value: "{{pincode}}", description: "Optional" },
      { key: "pincode_group_id", value: "1", description: "Optional", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[1], {
    name: "Service types",
    method: "GET",
    path: "/api/common/service-types",
    token: "No",
    request: "No body. Optional: none",
    response: j({
      success: true,
      data: [{ id: 1, name: "Standard Service", extra_price_per_kg: 0 }],
    }),
    postmanAuth: "none",
  }),
  api(SCENARIO_NAMES[1], {
    name: "Add address",
    method: "POST",
    path: "/api/user/address",
    token: "Yes (user Bearer)",
    request:
      j({
        address_type: "home",
        floor: "204",
        landmark: "Near station",
        receiver_name: "Karthik",
        contact_number: "9004186460",
        latitude: "19.1197",
        longitude: "72.8468",
        pincode: "400058",
        complete_address: "A-204, Lotus Residency, Andheri West",
        name: "Karthik",
        email: "karthik@example.com",
      }) +
      "\n\nRequired: address_type (home|work|institute), floor, landmark, receiver_name (or name), contact_number, latitude, longitude, pincode\nOptional: complete_address, name, email",
    response: j({
      success: true,
      message: "Address added successfully",
      data: { address_id: 3 },
    }),
    postmanAuth: "user",
    body: {
      address_type: "home",
      floor: "204",
      landmark: "Near station",
      receiver_name: "Karthik",
      contact_number: "{{mobile}}",
      latitude: "19.1197",
      longitude: "72.8468",
      pincode: "{{pincode}}",
      complete_address: "A-204, Lotus Residency, Andheri West",
      name: "Karthik",
      email: "karthik@example.com",
    },
    descriptionExtra:
      "OPTIONAL body: complete_address, name, email. Required: address_type, floor, landmark, receiver_name, contact_number, latitude, longitude, pincode.",
  }),
  api(SCENARIO_NAMES[1], {
    name: "Set default address",
    method: "PUT",
    path: "/api/user/address/default/:id",
    token: "Yes (user Bearer)",
    request: "No body.\nPath required: id = address_id\nOptional: none",
    response: j({ success: true, message: "Default address updated successfully" }),
    postmanAuth: "user",
    pathVars: { id: "{{addressId}}" },
  }),
  api(SCENARIO_NAMES[1], {
    name: "Slots availability",
    method: "GET",
    path: "/api/common/slots/availability",
    token: "No",
    request:
      "Required: pincode OR pincodeGroupId (or pincode_group_id)\nOptional: days (default 7)",
    response: j({
      success: true,
      data: {
        pincodeGroupId: 1,
        availability: [
          {
            date: "2026-09-10",
            slots: [{ shiftId: 1, available: true, remaining: 5 }],
          },
        ],
      },
    }),
    postmanAuth: "none",
    query: [
      { key: "pincode", value: "{{pincode}}", description: "Required unless pincodeGroupId" },
      { key: "pincodeGroupId", value: "1", description: "Optional (use instead of pincode)", disabled: true },
      { key: "days", value: "7", description: "Optional. Default 7", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[1], {
    name: "Create draft order",
    method: "POST",
    path: "/api/user/order/",
    token: "Yes (user Bearer)",
    request:
      j({ service_id: 1, clothes_count: 15 }) +
      "\n\nRequired: service_id, clothes_count (10–25)\nOptional: none",
    response: j({
      id: 74,
      order_id: "MG123456",
      message: "Order created successfully",
    }),
    postmanAuth: "user",
    body: { service_id: 1, clothes_count: 15 },
    saveOrder: true,
  }),
  api(SCENARIO_NAMES[1], {
    name: "Complete order (pickup + delivery)",
    method: "POST",
    path: "/api/user/order/:id/complete-order",
    token: "Yes (user Bearer)",
    request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) +
      "\n\nRequired: service_type_id, pickup_date, pickup_slot_id, next_delivery_date\nOptional: none\nAlt step-by-step: PUT service-type, PUT pickup, PUT delivery, POST finalize",
    response: j({
      message: "Order completed successfully",
      order_id: "74",
      delivery_date: "2026-09-13",
    }),
    postmanAuth: "user",
    body: {
      service_type_id: 1,
      pickup_date: "2026-09-10",
      pickup_slot_id: 1,
      next_delivery_date: "2026-09-13",
    },
  }),
  api(SCENARIO_NAMES[1], {
    name: "Review order",
    method: "GET",
    path: "/api/user/order/:id/review",
    token: "Yes (user Bearer)",
    request: "No body. Path required: id\nOptional: none. Loyalty coupon auto-applies.",
    response: j({
      order_id: "74",
      pricing_breakdown: {
        advance_payment: "0.00",
        total_payable_now: "0.00",
        approx_total: "1156.00",
      },
    }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[1], {
    name: "Confirm booking (pay ₹0 — no advance)",
    method: "POST",
    path: "/api/user/order/payment/:id/pay",
    token: "Yes (user Bearer)",
    request:
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) +
      "\n\nRequired: group_code, shift_id, day_of_week (1=Mon…7=Sun)\nOptional: none",
    response: j(bookPayRes),
    postmanAuth: "user",
    body: {
      group_code: "{{groupCode}}",
      shift_id: 1,
      day_of_week: 3,
    },
  }),
  api(SCENARIO_NAMES[1], {
    name: "Order detail",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "No body. Path required: id\nOptional: none",
    response: j({
      status: 200,
      message: "Order fetched successfully",
      data: { order_id: 74, status: "booked" },
    }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[1], {
    name: "Cancel order (press C)",
    method: "POST",
    path: "/api/user/order/:id/cancelService",
    token: "Yes (user Bearer)",
    request:
      j({
        reason_type: "changed_mind",
        reason_description: "Customer pressed C on WhatsApp",
      }) +
      "\n\nRequired: reason_type (pickup_schedule_issue | modify_order | service_charge_incorrect | changed_mind | other)\nOptional: reason_description (required only if reason_type=other)",
    response: j({ message: "Order cancelled successfully.", data: {} }),
    postmanAuth: "user",
    body: {
      reason_type: "changed_mind",
      reason_description: "Customer pressed C on WhatsApp",
    },
    descriptionExtra:
      "OPTIONAL: reason_description (required only when reason_type = other)",
  }),
  api(SCENARIO_NAMES[1], {
    name: "FAQ",
    method: "GET",
    path: "/api/common/faq",
    token: "No",
    request: "No body. Optional: none",
    response: j({ success: true, data: [{ id: 1, question: "...", answer: "..." }] }),
    postmanAuth: "none",
  }),
  api(SCENARIO_NAMES[1], {
    name: "How we work",
    method: "GET",
    path: "/api/common/how-we-work",
    token: "No",
    request: "No body. Optional: none",
    response: j({ success: true, data: [{ id: 1, heading: "Pickup", image: "https://..." }] }),
    postmanAuth: "none",
  }),
  api(SCENARIO_NAMES[1], {
    name: "Know about us / View pricing",
    method: "GET",
    path: "/api/common/know-about-us",
    token: "No",
    request: "No body. Optional: none",
    response: j({ success: true, data: [{ id: 1, title: "Wash by Kilo", image: "https://..." }] }),
    postmanAuth: "none",
  }),

  // —— S2 ——
  api(SCENARIO_NAMES[2], {
    name: "CRM inactive registered users",
    method: "GET",
    path: "/api/whatsapp/crm/inactive-app-users",
    token: "Gallabox secret",
    request:
      "Query optional: hours (default 48), limit (default 100, max 500)\nUsers with 0 completed orders and created_at older than hours.",
    response: j({
      success: true,
      data: [{ user_id: 12, mobile: "9004186460", total_orders: 0 }],
    }),
    postmanAuth: "whatsapp",
    query: [
      { key: "hours", value: "48", description: "Optional. Default 48" },
      { key: "limit", value: "100", description: "Optional. Default 100", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[2], {
    name: "Session after customer replies",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[2], {
    name: "Get profile",
    method: "GET",
    path: "/api/user/profile",
    token: "Yes (user Bearer)",
    request: "No body. Optional: none",
    response: j({
      success: true,
      data: { id: 12, full_name: "Karthik", current_orders: [] },
    }),
    postmanAuth: "user",
  }),

  // —— S3 ——
  api(SCENARIO_NAMES[3], {
    name: "Abandoned booking / cart resume",
    method: "GET",
    path: "/api/whatsapp/customer/:mobile/abandoned-booking",
    token: "Gallabox secret",
    request: "Path required: mobile\nOptional: none",
    response: j({
      success: true,
      data: { has_draft: true, order_id: 99, clothes_count: 16, clothes_band: "14-18" },
    }),
    postmanAuth: "whatsapp",
    pathVars: { mobile: "{{mobile}}" },
  }),
  api(SCENARIO_NAMES[3], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[3], {
    name: "Continue — review draft",
    method: "GET",
    path: "/api/user/order/:id/review",
    token: "Yes (user Bearer)",
    request: "Path: draft order_id from abandoned-booking\nOptional: none",
    response: j({ order_id: "99", service_details: { clothes_count: 16 } }),
    postmanAuth: "user",
    useDraftId: true,
  }),
  api(SCENARIO_NAMES[3], {
    name: "Continue — complete-order if pickup missing",
    method: "POST",
    path: "/api/user/order/:id/complete-order",
    token: "Yes (user Bearer)",
    request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) + "\n\nRequired: service_type_id, pickup_date, pickup_slot_id, next_delivery_date\nOptional: none",
    response: j({ message: "Order completed successfully" }),
    postmanAuth: "user",
    body: {
      service_type_id: 1,
      pickup_date: "2026-09-10",
      pickup_slot_id: 1,
      next_delivery_date: "2026-09-13",
    },
    useDraftId: true,
  }),
  api(SCENARIO_NAMES[3], {
    name: "Confirm booking pay ₹0",
    method: "POST",
    path: "/api/user/order/payment/:id/pay",
    token: "Yes (user Bearer)",
    request:
      j({ group_code: "MUM_WEST", shift_id: 1, day_of_week: 3 }) +
      "\n\nRequired: group_code, shift_id, day_of_week\nOptional: none",
    response: j(bookPayRes),
    postmanAuth: "user",
    body: { group_code: "{{groupCode}}", shift_id: 1, day_of_week: 3 },
    useDraftId: true,
  }),

  // —— S4 ——
  api(SCENARIO_NAMES[4], {
    name: "CRM win-back list",
    method: "GET",
    path: "/api/whatsapp/crm/winback",
    token: "Gallabox secret",
    request:
      "Query optional: days (default 30), total_orders (default 1), limit (default 100)",
    response: j({
      success: true,
      data: [
        {
          mobile: "9004186460",
          full_name: "Karthik",
          last_order_date: "2026-08-01",
          default_address: { id: 3, pincode: "400058" },
        },
      ],
    }),
    postmanAuth: "whatsapp",
    query: [
      { key: "days", value: "30", description: "Optional. Default 30" },
      { key: "total_orders", value: "1", description: "Optional. Default 1" },
      { key: "limit", value: "100", description: "Optional", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[4], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[4], {
    name: "List saved addresses",
    method: "GET",
    path: "/api/user/address",
    token: "Yes (user Bearer)",
    request: "No body. Optional: none",
    response: j({
      success: true,
      data: { addresses: [{ id: 3, pincode: "400058", is_selected: true }] },
    }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[4], {
    name: "Apply coupon (VALUED10 / win-back)",
    method: "POST",
    path: "/api/user/order/:id/applyCoupon",
    token: "Yes (user Bearer)",
    request:
      j({ coupon_code: "VALUED10" }) +
      "\n\nOptional: coupon_code — omit or {} to reapply loyalty\nTxt also listed POST /api/whatsapp/offers/apply — not built; use this.",
    response: j({ message: "Coupon applied successfully" }),
    postmanAuth: "user",
    body: { coupon_code: "VALUED10" },
    descriptionExtra: "OPTIONAL: coupon_code. Empty body {} reapplies loyalty coupon.",
  }),

  // —— S5 ——
  api(SCENARIO_NAMES[5], {
    name: "Emit pickup_day_reminder",
    method: "POST",
    path: "/api/whatsapp/events/emit",
    token: "Gallabox secret",
    request:
      j({ event: "pickup_day_reminder", order_id: 74 }) +
      "\n\nRequired: event\nOptional: order_id, mobile, data",
    response: j({ success: true }),
    postmanAuth: "whatsapp",
    body: { event: "pickup_day_reminder", order_id: "{{orderId}}" },
  }),
  api(SCENARIO_NAMES[5], {
    name: "Emit rider_assigned",
    method: "POST",
    path: "/api/whatsapp/events/emit",
    token: "Gallabox secret",
    request:
      j({ event: "rider_assigned", order_id: 74 }) +
      "\n\nRequired: event\nOptional: order_id, data",
    response: j({ success: true }),
    postmanAuth: "whatsapp",
    body: { event: "rider_assigned", order_id: "{{orderId}}" },
  }),
  api(SCENARIO_NAMES[5], {
    name: "Order detail",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "No body. Path required: id\nOptional: none",
    response: j({ status: 200, data: { order_id: 74, status: "booked" } }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[5], {
    name: "Rider contact",
    method: "GET",
    path: "/api/whatsapp/orders/:id/rider",
    token: "Gallabox secret",
    request: "Path required: id\nOptional: none",
    response: j({
      success: true,
      data: { rider_name: "Suresh K.", mobile: "9xxxxxxxxx", track_url: null },
    }),
    postmanAuth: "whatsapp",
  }),
  api(SCENARIO_NAMES[5], {
    name: "Reschedule pickup",
    method: "PUT",
    path: "/api/user/order/:id/rescheduleOrderPickup",
    token: "Yes (user Bearer)",
    request:
      j({ pickup_date: "2026-09-11", pickup_slot_id: 1 }) +
      "\n\nRequired: pickup_date, pickup_slot_id\nOptional: none",
    response: j({ message: "Pickup rescheduled successfully" }),
    postmanAuth: "user",
    body: { pickup_date: "2026-09-11", pickup_slot_id: 1 },
  }),
  api(SCENARIO_NAMES[5], {
    name: "Cancel booking",
    method: "POST",
    path: "/api/user/order/:id/cancelService",
    token: "Yes (user Bearer)",
    request:
      j({ reason_type: "pickup_schedule_issue" }) +
      "\n\nRequired: reason_type\nOptional: reason_description",
    response: j({ message: "Order cancelled successfully." }),
    postmanAuth: "user",
    body: { reason_type: "pickup_schedule_issue" },
  }),

  // —— S6 ——
  api(SCENARIO_NAMES[6], {
    name: "Emit pickup_completed",
    method: "POST",
    path: "/api/whatsapp/events/emit",
    token: "Gallabox secret",
    request:
      j({ event: "pickup_completed", order_id: 74 }) +
      "\n\nRequired: event\nOptional: order_id",
    response: j({ success: true }),
    postmanAuth: "whatsapp",
    body: { event: "pickup_completed", order_id: "{{orderId}}" },
  }),
  api(SCENARIO_NAMES[6], {
    name: "Order detail",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "No body. Optional: none. Expect status picked_up / in_process",
    response: j({ status: 200, data: { order_id: 74, status: "picked_up" } }),
    postmanAuth: "user",
  }),

  // —— S7 ——
  api(SCENARIO_NAMES[7], {
    name: "Vendor confirm-weight (internal)",
    method: "POST",
    path: "/api/vendor/order/:order_id/confirm-weight",
    token: "Yes (vendor Bearer)",
    request:
      "form-data Required: actual_weight\nOptional: is_stained, vendor_request_amount, stain images",
    response: j({
      success: true,
      data: { actual_weight: 6.8, remaining_amount: 1185.04 },
    }),
    postmanAuth: "vendor",
    skipBodyJson: true,
  }),
  api(SCENARIO_NAMES[7], {
    name: "Vendor finalize (internal)",
    method: "POST",
    path: "/api/vendor/order/:order_id/finalize",
    token: "Yes (vendor Bearer)",
    request: "No body. Optional: none",
    response: j({ success: true, data: { status: "order_finalized" } }),
    postmanAuth: "vendor",
  }),
  api(SCENARIO_NAMES[7], {
    name: "Emit order.weight_confirmed",
    method: "POST",
    path: "/api/whatsapp/events/emit",
    token: "Gallabox secret",
    request:
      j({ event: "order.weight_confirmed", order_id: 74 }) +
      "\n\nRequired: event\nOptional: order_id, data",
    response: j({ success: true }),
    postmanAuth: "whatsapp",
    body: { event: "order.weight_confirmed", order_id: "{{orderId}}" },
  }),
  api(SCENARIO_NAMES[7], {
    name: "Order detail (bill)",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "No body. Optional: none",
    response: j({
      status: 200,
      data: {
        actual_weight: 6.8,
        final_total: 1685.04,
        remaining_amount: 1185.04,
      },
    }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[7], {
    name: "Create Razorpay order (Pay Now)",
    method: "POST",
    path: "/api/user/order/payment/:id/create-order",
    token: "Yes (user Bearer)",
    request:
      j({ amount: 1185.04, payment_type: "remaining" }) +
      "\n\nRequired: amount, payment_type\nOptional: none",
    response: j({
      key_id: "rzp_live_xxx",
      order_id: "order_xxx",
      amount: 118504,
      currency: "INR",
    }),
    postmanAuth: "user",
    body: { amount: 1185.04, payment_type: "remaining" },
  }),
  api(SCENARIO_NAMES[7], {
    name: "Verify Razorpay payment",
    method: "POST",
    path: "/api/user/order/payment/:id/verify",
    token: "Yes (user Bearer)",
    request:
      j({
        razorpay_order_id: "order_xxx",
        razorpay_payment_id: "pay_xxx",
        razorpay_signature: "sig_xxx",
      }) +
      "\n\nRequired: razorpay_order_id, razorpay_payment_id, razorpay_signature\nOptional: none",
    response: j({ message: "Payment verified successfully", verified: true }),
    postmanAuth: "user",
    body: {
      razorpay_order_id: "order_xxx",
      razorpay_payment_id: "pay_xxx",
      razorpay_signature: "sig_xxx",
    },
  }),
  api(SCENARIO_NAMES[7], {
    name: "Razorpay webhook",
    method: "POST",
    path: "/api/user/order/payment/razorpay/webhook",
    token: "Razorpay signature (no user token)",
    request: "Razorpay payment.captured payload. Optional: none (Razorpay-owned)",
    response: j({ success: true }),
    postmanAuth: "none",
  }),

  // —— S8 ——
  api(SCENARIO_NAMES[8], {
    name: "Customer lookup",
    method: "POST",
    path: "/api/whatsapp/customer/lookup",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j({ success: true, data: { exists: false, full_name: null } }),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
  }),
  api(SCENARIO_NAMES[8], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),

  // —— S9 ——
  api(SCENARIO_NAMES[9], {
    name: "Customer lookup",
    method: "POST",
    path: "/api/whatsapp/customer/lookup",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(lookupRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
  }),
  api(SCENARIO_NAMES[9], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[9], {
    name: "List user orders",
    method: "GET",
    path: "/api/user/order/getUserOrder",
    token: "Yes (user Bearer)",
    request:
      "Query optional: status, time, page, limit\nstatus: booked | out_for_pickup | pickup_in_progress | picked_up | in_process | order_finalized | ready_for_delivery | out_for_delivery | delivered | cancelled",
    response: j({
      status: 200,
      data: [{ order_id: 74, status: "booked" }],
    }),
    postmanAuth: "user",
    query: [
      { key: "status", value: "booked", description: "Optional filter", disabled: true },
      { key: "page", value: "1", description: "Optional", disabled: true },
      { key: "limit", value: "10", description: "Optional", disabled: true },
    ],
  }),
  api(SCENARIO_NAMES[9], {
    name: "Order detail",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "Path required: id\nOptional: none",
    response: j({ status: 200, data: { order_id: 74, status: "booked" } }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[9], {
    name: "Active order by mobile",
    method: "GET",
    path: "/api/whatsapp/orders/active-by-mobile",
    token: "Gallabox secret",
    request: "Query required: mobile\nOptional: none",
    response: j({
      success: true,
      data: { has_active_order: true, order_id: 74, stage_label: "Booking Confirmed" },
    }),
    postmanAuth: "whatsapp",
    query: [{ key: "mobile", value: "{{mobile}}", description: "Required" }],
  }),

  // —— S10 ——
  api(SCENARIO_NAMES[10], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[10], {
    name: "Active order by mobile",
    method: "GET",
    path: "/api/whatsapp/orders/active-by-mobile",
    token: "Gallabox secret",
    request: "Query required: mobile\nOptional: none",
    response: j({ success: true, data: { has_active_order: true, order_id: 74 } }),
    postmanAuth: "whatsapp",
    query: [{ key: "mobile", value: "{{mobile}}", description: "Required" }],
  }),
  api(SCENARIO_NAMES[10], {
    name: "Order detail",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "Path required: id\nOptional: none",
    response: j({ status: 200, data: { order_id: 74, status: "out_for_pickup" } }),
    postmanAuth: "user",
  }),
  api(SCENARIO_NAMES[10], {
    name: "Delay status",
    method: "GET",
    path: "/api/whatsapp/orders/:id/delay-status",
    token: "Gallabox secret",
    request: "Path required: id\nOptional: none",
    response: j({
      success: true,
      data: { is_delayed: true, type: "pickup", reason: "past_scheduled_date" },
    }),
    postmanAuth: "whatsapp",
  }),
  api(SCENARIO_NAMES[10], {
    name: "Need help / escalate",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({ report_issue: "delay", message: "Pickup delayed" }) +
      "\n\nRequired: message\nOptional: report_issue",
    response: j({ success: true, message: "Support request submitted successfully" }),
    postmanAuth: "user",
    body: { report_issue: "delay", message: "Pickup delayed" },
    descriptionExtra: "OPTIONAL: report_issue. Required: message",
  }),

  // —— S11 ——
  api(SCENARIO_NAMES[11], {
    name: "Session",
    method: "POST",
    path: "/api/whatsapp/session",
    token: "Gallabox secret",
    request: j({ mobile: "9004186460" }) + "\n\nRequired: mobile\nOptional: none",
    response: j(sessionRes),
    postmanAuth: "whatsapp",
    body: { mobile: "{{mobile}}" },
    saveToken: true,
  }),
  api(SCENARIO_NAMES[11], {
    name: "Report order issue",
    method: "POST",
    path: "/api/user/order/report-order",
    token: "Yes (user Bearer)",
    request:
      j({
        order_id: 74,
        issue_type: "missing",
        issue_reason: "shirt_missing",
        description: "One shirt missing from delivery",
      }) +
      "\n\nRequired: order_id, issue_type, issue_reason\nOptional: description",
    response: j({ success: true }),
    postmanAuth: "user",
    body: {
      order_id: "{{orderId}}",
      issue_type: "missing",
      issue_reason: "shirt_missing",
      description: "One shirt missing from delivery",
    },
    descriptionExtra: "OPTIONAL: description. Required: order_id, issue_type, issue_reason",
  }),
  api(SCENARIO_NAMES[11], {
    name: "Need help",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({ report_issue: "missing_item", message: "Shirt missing" }) +
      "\n\nRequired: message\nOptional: report_issue",
    response: j({ success: true, message: "Support request submitted successfully" }),
    postmanAuth: "user",
    body: { report_issue: "missing_item", message: "Shirt missing" },
  }),

  // —— S12 ——
  api(SCENARIO_NAMES[12], {
    name: "Retry create Razorpay order",
    method: "POST",
    path: "/api/user/order/payment/:id/create-order",
    token: "Yes (user Bearer)",
    request:
      j({ amount: 1185.04, payment_type: "remaining" }) +
      "\n\nRequired: amount, payment_type\nOptional: none",
    response: j({ key_id: "rzp_xxx", order_id: "order_xxx", amount: 118504 }),
    postmanAuth: "user",
    body: { amount: 1185.04, payment_type: "remaining" },
  }),
  api(SCENARIO_NAMES[12], {
    name: "Need help (payment dispute fallback)",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({
        report_issue: "payment_issue",
        message: "Payment failed but amount deducted / double charged",
      }) +
      "\n\nRequired: message\nOptional: report_issue\nPOST /api/whatsapp/payment-disputes is NOT built.",
    response: j({ success: true }),
    postmanAuth: "user",
    body: {
      report_issue: "payment_issue",
      message: "Payment failed but amount deducted",
    },
  }),

  // —— S13 ——
  api(SCENARIO_NAMES[13], {
    name: "Need help (negative feedback)",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({ report_issue: "negative_feedback", message: "2-star: delay" }) +
      "\n\nRequired: message\nOptional: report_issue\nPOST /api/whatsapp/orders/:id/rating is NOT built.",
    response: j({ success: true }),
    postmanAuth: "user",
    body: { report_issue: "negative_feedback", message: "2-star: delay" },
  }),

  // —— S14 ——
  api(SCENARIO_NAMES[14], {
    name: "Need help (agent request)",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({
        report_issue: "agent_request",
        message: "Customer requested live agent from WhatsApp",
      }) +
      "\n\nRequired: message\nOptional: report_issue\nPOST /api/whatsapp/agent-handoff is NOT built — use Gallabox native handoff + this.",
    response: j({ success: true }),
    postmanAuth: "user",
    body: {
      report_issue: "agent_request",
      message: "Customer requested live agent from WhatsApp",
    },
  }),
  api(SCENARIO_NAMES[14], {
    name: "Order detail while waiting",
    method: "GET",
    path: "/api/user/order/:id/Orderdetail",
    token: "Yes (user Bearer)",
    request: "Optional if customer picks Track. Path required: id",
    response: j({ status: 200, data: { order_id: 74, status: "booked" } }),
    postmanAuth: "user",
  }),

  // —— S15 ——
  api(SCENARIO_NAMES[15], {
    name: "Unrecognized — re-show menu",
    method: "—",
    path: "Gallabox menu only (no MetroGini API)",
    token: "No",
    request: "Optional: none. First fallback: re-show current-step menu.",
    response: "No API",
    postmanAuth: "skip",
  }),
  api(SCENARIO_NAMES[15], {
    name: "Second fail — needHelp",
    method: "POST",
    path: "/api/user/needHelp",
    token: "Yes (user Bearer)",
    request:
      j({
        report_issue: "unrecognized_input",
        message: "Two consecutive unrecognized WhatsApp messages",
      }) +
      "\n\nRequired: message\nOptional: report_issue",
    response: j({ success: true }),
    postmanAuth: "user",
    body: {
      report_issue: "unrecognized_input",
      message: "Two consecutive unrecognized WhatsApp messages",
    },
  }),
];
