/**
 * Gallabox Excel rows for Scenarios 4–15.
 * Numbering follows Whatsapp scenarios -updated.docx (1–11),
 * then whatasppFlow / API map extras (12–15).
 */
const base = "https://api.metrogini.com";
const j = (obj) => JSON.stringify(obj, null, 2);

const authPair = (startStep) => [
  {
    Step: startStep,
    Name: "Send OTP",
    Endpoint: `POST ${base}/api/user/login-or-register`,
    Request:
      j({ mobile: "9004186460" }) +
      "\n\nRequired: mobile\nOptional: none",
    Response: j({
      success: true,
      message: "OTP sent successfully",
      data: { id: 12, mobile: "9004186460", profile_completed: true },
    }),
    "Bearer token required": "No",
  },
  {
    Step: startStep + 1,
    Name: "Verify OTP",
    Endpoint: `POST ${base}/api/user/verify-otp`,
    Request:
      j({ mobile: "9004186460", otp: "1234" }) +
      "\n\nRequired: mobile, otp\nSave access_token.",
    Response: j({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: "<jwt>",
        refresh_token: "<token>",
        expires_in: "7d",
        profile_completed: true,
      },
    }),
    "Bearer token required": "No",
  },
];

const bookTail = (startStep, note = "") => [
  {
    Step: startStep,
    Name: "Pincode check",
    Endpoint: `GET ${base}/api/common/pincode-check?pincode=400058`,
    Request:
      "No body.\nQuery required: pincode\n" +
      (note || "If not serviceable → coming soon; stop."),
    Response: j({
      success: true,
      data: {
        serviceable: true,
        pincode: "400058",
        pincode_group_id: 1,
        group_code: "MUM_WEST",
        has_vendor_slots: true,
        has_rider_slots: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: startStep + 1,
    Name: "List / add address",
    Endpoint: `GET ${base}/api/user/address` +
      "\n(+ POST " +
      `${base}/api/user/address` +
      " if needed)",
    Request:
      "List first. If usable default exists, skip add.\nElse POST address (stricter bookable pincode) + PUT default/:id.",
    Response: j({
      success: true,
      data: {
        addresses: [
          {
            id: 3,
            complete_address: "A-204, Lotus Residency",
            pincode: "400058",
            is_selected: true,
          },
        ],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: startStep + 2,
    Name: "Create draft — garment count",
    Endpoint: `POST ${base}/api/user/order/`,
    Request:
      j({ service_id: 1, clothes_count: 15 }) +
      "\n\nRequired: service_id, clothes_count (10–25)",
    Response: j({
      id: 74,
      order_id: "MG123456",
      message: "Order created successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: startStep + 3,
    Name: "Slots + complete-order",
    Endpoint: `GET ${base}/api/common/slots/availability?pincode=400058&days=7` +
      "\nthen\n" +
      `POST ${base}/api/user/order/:id/complete-order`,
    Request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) +
      "\n\nPickup: Tomorrow / Day after. Delivery = pickup + 72h.",
    Response: j({
      message: "Order completed successfully",
      order_id: "74",
      delivery_date: "2026-09-13",
    }),
    "Bearer token required": "Yes (complete-order)",
  },
  {
    Step: startStep + 4,
    Name: "Review + confirm ₹0",
    Endpoint: `GET ${base}/api/user/order/:id/review` +
      "\nthen\n" +
      `POST ${base}/api/user/order/payment/:id/pay`,
    Request:
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) +
      "\n\nNo advance. Loyalty coupon may auto-apply on review.",
    Response: j({
      message: "Payment successful. Order booked.",
      order_id: 74,
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
];

const knowMore = (startStep) => [
  {
    Step: startStep,
    Name: "Know more — FAQ",
    Endpoint: `GET ${base}/api/common/faq`,
    Request: "No body.",
    Response: j({
      success: true,
      data: [{ id: 1, question: "...", answer: "..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: startStep + 1,
    Name: "Know more — How we work",
    Endpoint: `GET ${base}/api/common/how-we-work`,
    Request: "No body.",
    Response: j({
      success: true,
      data: [{ id: 1, heading: "Pickup", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: startStep + 2,
    Name: "Know more — View pricing",
    Endpoint: `GET ${base}/api/common/know-about-us`,
    Request: "No body. Optional: GET /api/common/services?pincode=...",
    Response: j({
      success: true,
      data: [{ id: 1, title: "Wash by Kilo", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
];

export const scenario4Rows = [
  {
    Step: 1,
    Name: "Find abandoned drafts (CRM — MISSING)",
    Endpoint: `GET ${base}/api/whatsapp/customer/:mobile/abandoned-booking`,
    Request:
      "STATUS: NOT BUILT.\nNeeded for push: users with draft / cart, no booked order.\nUntil built: Gallabox segment OR poll drafts via profile + orders if exposed.",
    Response: j({
      success: true,
      data: {
        has_draft: true,
        order_id: 99,
        clothes_count: 16,
        clothes_band: "14-18",
        estimated_kg: "5-7",
        amount_range: "1050-1470",
      },
    }),
    "Bearer token required": "System (when built)",
  },
  {
    Step: 2,
    Name: "Outbound push — resume booking",
    Endpoint: "— Gallabox template only —",
    Request:
      "\"Looks like you were checking out a Wash by Kilo booking earlier — 14 to 18 garments (Appx 5–7 kg). Would you like to pick up where you left off?\"\n1. Continue my booking\n2. Start a new booking\n3. Know more about MetroGini",
    Response: "Delivered via Gallabox. No MetroGini API.",
    "Bearer token required": "No",
  },
  ...authPair(3),
  {
    Step: 5,
    Name: "Get profile / find draft order",
    Endpoint: `GET ${base}/api/user/profile`,
    Request:
      "No body.\ncurrent_orders may omit drafts (list API excludes draft).\nContinue path needs draft order_id from CRM (Step 1) or internal lookup when built.\nConfirm clothes_count from draft for copy + FIRST15 still valid.",
    Response: j({
      success: true,
      data: {
        id: 12,
        full_name: "Karthik",
        current_orders: [],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Menu (no API)",
    Endpoint: "— Gallabox menu only —",
    Request:
      "1. Continue my booking → Step 7 (reuse draft :id)\n2. Start a new booking → full Scenario 1 book flow\n3. Know more → Step 11",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  {
    Step: 7,
    Name: "Continue — confirm draft selection",
    Endpoint: `GET ${base}/api/user/order/:id/review`,
    Request:
      "Path: id = abandoned draft order_id\nBot: \"Confirming your selection: 14–18 garments … FIRST15 still valid.\"\nIf review 404 → draft incomplete; fall back to complete-order then review.",
    Response: j({
      order_id: "99",
      service_details: { clothes_count: 16 },
      pricing_breakdown: {
        coupon: { coupon_code: "FIRST15" },
        advance_payment: "0.00",
        approx_total: "1156.00",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 8,
    Name: "Continue — pickup date if not set",
    Endpoint: `GET ${base}/api/common/slots/availability?pincode=400058&days=7` +
      "\nthen\n" +
      `POST ${base}/api/user/order/:id/complete-order`,
    Request:
      "Only if draft missing pickup/service_type.\nElse skip to confirm pay.",
    Response: j({ message: "Order completed successfully", order_id: "99" }),
    "Bearer token required": "Yes",
  },
  {
    Step: 9,
    Name: "Confirm booking ₹0",
    Endpoint: `POST ${base}/api/user/order/payment/:id/pay`,
    Request:
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) + "\n\nRequired: group_code, shift_id, day_of_week",
    Response: j({
      message: "Payment successful. Order booked.",
      order_id: 99,
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 10,
    Name: "Start new booking",
    Endpoint: "— Same as Scenario 1 Steps 3–11 —",
    Request:
      "pincode-check → address → create draft → slots → complete → review → pay ₹0",
    Response: "See Scenario 1 sheet.",
    "Bearer token required": "Yes",
  },
  ...knowMore(11),
];

export const scenario5Rows = [
  {
    Step: 1,
    Name: "Win-back segment (CRM — MISSING)",
    Endpoint: `GET ${base}/api/whatsapp/crm/winback?days=30&total_orders=1`,
    Request:
      "STATUS: NOT BUILT.\nTrigger: exactly 1 completed order, inactive ~30 days.\nResponse item: mobile, full_name, last_order_date, default_address.",
    Response: j({
      success: true,
      data: [
        {
          mobile: "9004186460",
          full_name: "Karthik",
          last_order_date: "2026-08-01",
          total_orders: 1,
          default_address: {
            id: 3,
            complete_address: "A-204, Lotus Residency, Andheri West",
            pincode: "400058",
          },
        },
      ],
    }),
    "Bearer token required": "System (when built)",
  },
  {
    Step: 2,
    Name: "Outbound push — retention offer",
    Endpoint: "— Gallabox template only —",
    Request:
      "\"Hi <user_name> 👋 It's been a while… Here's 10% off <VALUED10>, valid 3 days.\"\n1. Book Now\n2. Know more about MetroGini",
    Response: "Gallabox template send.",
    "Bearer token required": "No",
  },
  ...authPair(3),
  {
    Step: 5,
    Name: "Get profile + saved address",
    Endpoint: `GET ${base}/api/user/profile` +
      "\nand\n" +
      `GET ${base}/api/user/address`,
    Request:
      "Bot: \"Should we collect from your saved address? 📍 …\"\n1. Yes, use this address → set default if needed\n2. No, change address → Scenario 1 address flow",
    Response: j({
      success: true,
      data: {
        addresses: [
          {
            id: 3,
            complete_address: "A-204, Lotus Residency, Andheri West, Mumbai – 400058",
            pincode: "400058",
            is_selected: true,
          },
        ],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Use saved address",
    Endpoint: `PUT ${base}/api/user/address/default/:id`,
    Request: "Path: id = address id. Skip if already selected.",
    Response: j({
      success: true,
      message: "Default address updated successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 7,
    Name: "Book — garments → confirm",
    Endpoint: "— Scenario 1 booking chain —",
    Request:
      "create draft → slots → complete-order → review → pay ₹0\nApply VALUED10 after review if needed:\nPOST /api/user/order/:id/applyCoupon { \"coupon_code\": \"VALUED10\" }",
    Response: j({
      message: "Payment successful. Order booked.",
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 8,
    Name: "Apply win-back coupon (optional)",
    Endpoint: `POST ${base}/api/user/order/:id/applyCoupon`,
    Request:
      j({ coupon_code: "VALUED10" }) +
      "\n\nRequired: coupon_code\nCall after draft/complete, before or after review.",
    Response: j({
      message: "Coupon applied successfully",
      discount: 10,
    }),
    "Bearer token required": "Yes",
  },
  ...knowMore(9),
];

export const scenario6Rows = [
  {
    Step: 1,
    Name: "Trigger — pickup day reminder (MISSING webhook)",
    Endpoint: "MetroGini → Gallabox event: pickup_day_reminder",
    Request:
      "STATUS: NOT BUILT.\nFire morning of pickup_date.\nPayload suggestion: order_id, mobile, order_code, pickup_window, user_name",
    Response: j({
      event: "pickup_day_reminder",
      order_id: 24571,
      mobile: "9004186460",
      data: {
        order_code: "MG24571",
        pickup_date: "2026-09-10",
        pickup_slot: "11:00 AM – 1:00 PM",
      },
    }),
    "Bearer token required": "System → Gallabox",
  },
  {
    Step: 2,
    Name: "Bot shows reminder (read order)",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request:
      "Auth user JWT (or use event payload without re-fetch).\nBot: \"Good morning … Today's the day! Booking ID: MG24571\"\n1. Confirm I'll be available\n2. Need help",
    Response: j({
      status: 200,
      data: {
        order_id: 24571,
        order_code: "MG24571",
        status: "booked",
        pickup_date: "2026-09-10",
      },
    }),
    "Bearer token required": "Yes (if calling API)",
  },
  {
    Step: 3,
    Name: "Confirm available (no API / log only)",
    Endpoint: "— Gallabox only —",
    Request: "Customer selects 1 → \"Thank you for confirming!!\"",
    Response: "No MetroGini API required.",
    "Bearer token required": "No",
  },
  {
    Step: 4,
    Name: "Need help menu",
    Endpoint: "— Gallabox menu —",
    Request:
      "1. Re-schedule my pickup → Step 5\n2. Cancel my booking → Step 6",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  {
    Step: 5,
    Name: "Re-schedule pickup",
    Endpoint: `PUT ${base}/api/user/order/:id/rescheduleOrderPickup`,
    Request:
      "Body (check Postman for exact fields): next pickup_date + slot.\nShow next available dates via slots/availability first.",
    Response: j({
      success: true,
      message: "Pickup rescheduled successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Cancel booking",
    Endpoint: `POST ${base}/api/user/order/:id/cancelService`,
    Request:
      j({
        reason_type: "pickup_schedule_issue",
        reason_description: "Customer cancelled on pickup day via WhatsApp",
      }) +
      "\n\nBot: \"I have cancelled your booking. Thank you for choosing MetroGini.\"\nNote: cancel may fail if <12h to pickup.",
    Response: j({ message: "Order cancelled successfully.", data: {} }),
    "Bearer token required": "Yes",
  },
  {
    Step: 7,
    Name: "Trigger — rider assigned (MISSING webhook)",
    Endpoint: "MetroGini → Gallabox event: rider_assigned",
    Request:
      "Closer to pickup window.\nBot: \"🚴 Your Rider has been assigned! Rider: Suresh K.\"\nOptional: any instructions for rider.",
    Response: j({
      event: "rider_assigned",
      order_id: 24571,
      data: {
        rider_name: "Suresh K.",
        rider_mobile: "9xxxxxxxxx",
      },
    }),
    "Bearer token required": "System → Gallabox",
  },
  {
    Step: 8,
    Name: "Read rider from order detail (PARTIAL)",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request:
      "Use if webhook payload incomplete.\nMISSING nicer API: GET /api/whatsapp/orders/:id/rider",
    Response: j({
      status: 200,
      data: {
        order_id: 24571,
        status: "out_for_pickup",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 9,
    Name: "Need help → human",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request:
      j({
        report_issue: "pickup_help",
        message: "Need help on pickup day",
      }) + "\n\nOr escalate in Gallabox to live agent.",
    Response: j({ success: true, message: "Help request submitted" }),
    "Bearer token required": "Yes",
  },
];

export const scenario7Rows = [
  {
    Step: 1,
    Name: "Trigger — pickup completed (MISSING webhook)",
    Endpoint: "MetroGini → Gallabox event: pickup_completed",
    Request:
      "Fire when rider verifies pickup OTP.\nBot: \"✅ Pickup Successful! Clothes collected by <rider>. We'll notify when laundry weighs them.\"",
    Response: j({
      event: "pickup_completed",
      order_id: 24571,
      mobile: "9004186460",
      data: { rider_name: "Suresh K.", status: "picked_up" },
    }),
    "Bearer token required": "System → Gallabox",
  },
  {
    Step: 2,
    Name: "Optional read status",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request: "Confirm status picked_up / in_process.",
    Response: j({
      status: 200,
      data: { order_id: 24571, status: "picked_up" },
    }),
    "Bearer token required": "Yes",
  },
];

export const scenario8Rows = [
  {
    Step: 1,
    Name: "Vendor confirms weight (internal)",
    Endpoint: `POST ${base}/api/vendor/order/:order_id/confirm-weight`,
    Request:
      "Vendor app (not Gallabox).\nform-data: actual_weight=6.8, is_stained=0\nThen often: POST .../finalize",
    Response: j({
      success: true,
      data: {
        order_id: 24571,
        actual_weight: 6.8,
        final_total: 1685.04,
        remaining_amount: 1185.04,
      },
    }),
    "Bearer token required": "Vendor Bearer",
  },
  {
    Step: 2,
    Name: "Vendor finalize (internal)",
    Endpoint: `POST ${base}/api/vendor/order/:order_id/finalize`,
    Request: "No body / vendor JWT.",
    Response: j({
      success: true,
      data: { order_id: 24571, status: "order_finalized" },
    }),
    "Bearer token required": "Vendor Bearer",
  },
  {
    Step: 3,
    Name: "Trigger — weight confirmed (MISSING webhook)",
    Endpoint: "MetroGini → Gallabox event: order.weight_confirmed",
    Request:
      "Bot:\n\"🏭 Clothes Reached Laundry…\"\n\"⚖️ Weight Confirmed: 6.8 kg … Amount Payable: ₹1,185.04\"\n1. Razorpay link\n2. QR code",
    Response: j({
      event: "order.weight_confirmed",
      order_id: 24571,
      data: {
        actual_weight: 6.8,
        final_total: 1685.04,
        remaining_amount: 1185.04,
      },
    }),
    "Bearer token required": "System → Gallabox",
  },
  {
    Step: 4,
    Name: "Read bill",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request:
      "Use remaining_amount, final_total, actual_weight, payment_status.",
    Response: j({
      status: 200,
      data: {
        order_id: 24571,
        status: "order_finalized",
        actual_weight: 6.8,
        final_total: 1685.04,
        remaining_amount: 1185.04,
        amount_paid: 500,
        payment_status: "partially_paid",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Create Razorpay order (Pay Now)",
    Endpoint: `POST ${base}/api/user/order/payment/:id/create-order`,
    Request:
      j({
        amount: 1185.04,
        payment_type: "remaining",
      }) +
      "\n\nRequired: amount, payment_type=remaining\nBuild payment link / QR from key_id + order_id.",
    Response: j({
      key_id: "rzp_live_xxx",
      order_id: "order_xxx",
      amount: 118504,
      currency: "INR",
      payment_type: "remaining",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Verify payment after Razorpay",
    Endpoint: `POST ${base}/api/user/order/payment/:id/verify`,
    Request:
      j({
        razorpay_order_id: "order_xxx",
        razorpay_payment_id: "pay_xxx",
        razorpay_signature: "signature_xxx",
      }) + "\n\nRequired: all three Razorpay fields",
    Response: j({
      message: "Payment verified successfully",
      verified: true,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 7,
    Name: "Razorpay webhook (backup)",
    Endpoint: `POST ${base}/api/user/order/payment/razorpay/webhook`,
    Request: "Razorpay payment.captured event. Signature header required.",
    Response: j({ success: true }),
    "Bearer token required": "Razorpay signature (no user token)",
  },
  {
    Step: 8,
    Name: "Payment success message",
    Endpoint: "— Gallabox copy —",
    Request:
      "\"Thank you!! Your payment has been received for order <order no>\"",
    Response: "No API.",
    "Bearer token required": "No",
  },
];

export const scenario9Rows = [
  {
    Step: 1,
    Name: "Customer lookup by mobile (MISSING)",
    Endpoint: `POST ${base}/api/whatsapp/customer/lookup`,
    Request:
      j({ mobile: "9004186460" }) +
      "\n\nSTATUS: NOT BUILT.\n9A no prior data → generic welcome.\n9B known lead name → \"Hello Karthik 👋\"\nUntil built: login/verify + GET profile.",
    Response: j({
      success: true,
      data: {
        exists: false,
        full_name: null,
        total_orders: 0,
      },
    }),
    "Bearer token required": "System (when built)",
  },
  ...authPair(2),
  {
    Step: 4,
    Name: "Get profile (name if known)",
    Endpoint: `GET ${base}/api/user/profile`,
    Request:
      "If full_name set → personalised greeting.\nElse generic Scenario 1 welcome.",
    Response: j({
      success: true,
      data: {
        id: 12,
        full_name: null,
        current_orders: [],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Main menu (no API)",
    Endpoint: "— Gallabox menu —",
    Request:
      "1. Book for Wash by Kilo → Scenario 1 book flow\n2. Know more → FAQ / how-we-work / pricing\n3. Know about Existing Booking → getUserOrder (likely empty for new)",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  ...bookTail(6, "New / organic customer — full book path."),
  ...knowMore(11),
  {
    Step: 14,
    Name: "Existing booking (likely none)",
    Endpoint: `GET ${base}/api/user/order/getUserOrder`,
    Request: "If empty → no active booking copy.",
    Response: j({
      status: 200,
      message: "No orders found",
      data: [],
    }),
    "Bearer token required": "Yes",
  },
];

export const scenario10Rows = [
  ...authPair(1),
  {
    Step: 3,
    Name: "Get profile — personalised Hi",
    Endpoint: `GET ${base}/api/user/profile`,
    Request:
      "Bot: \"Hello <user name> 👋 Welcome to MetroGini…\"\n1. Book\n2. Know more\n3. Existing Booking\nLoyalty nudge for book: ₹15/kg (Bulk15) not FIRST15 if past first orders.",
    Response: j({
      success: true,
      data: {
        id: 12,
        full_name: "Karthik",
        current_orders: [{ order_id: 74, status: "booked" }],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 4,
    Name: "Book — use saved address",
    Endpoint: `GET ${base}/api/user/address`,
    Request:
      "Pre-fill saved address. Then garments → pickup → confirm (Scenario 1).\nLoyalty auto on review (per_kg if 3rd+).",
    Response: j({
      success: true,
      data: {
        addresses: [
          {
            id: 3,
            complete_address: "A-204…",
            pincode: "400058",
            is_selected: true,
          },
        ],
      },
    }),
    "Bearer token required": "Yes",
  },
  ...bookTail(5),
  ...knowMore(10),
  {
    Step: 13,
    Name: "Existing booking — list",
    Endpoint: `GET ${base}/api/user/order/getUserOrder`,
    Request:
      "Show ONE current stage only.\nMap status → WhatsApp copy (booked / rider / collected / laundry / weight / paid / out for delivery / delivered).",
    Response: j({
      status: 200,
      data: [{ order_id: 74, status: "booked", clothes_count: 15 }],
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 14,
    Name: "Existing booking — detail",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request: "Path id from list. Full stage fields + payment if finalized.",
    Response: j({
      status: 200,
      data: {
        order_id: 74,
        order_code: "MG24571",
        status: "booked",
        pickup_date: "2026-09-10",
        delivery_date: "2026-09-13",
      },
    }),
    "Bearer token required": "Yes",
  },
];

export const scenario11Rows = [
  ...authPair(1),
  {
    Step: 3,
    Name: "Find active order",
    Endpoint: `GET ${base}/api/user/order/getUserOrder`,
    Request:
      "Customer: \"Where is my pickup?…\"\nIf none → ask Booking ID / Orderdetail by id.\nMISSING richer ETA: GET /api/whatsapp/orders/:id/delay-status",
    Response: j({
      status: 200,
      data: [{ order_id: 74, status: "out_for_pickup" }],
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 4,
    Name: "Order detail + rider",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request:
      "Pickup delay copy: apology + rider on the way.\nDelivery delay: order out for delivery, new ETA before 8PM.\nIf no ETA data → escalate agent (needHelp).",
    Response: j({
      status: 200,
      data: {
        order_id: 74,
        status: "out_for_pickup",
        order_code: "MG24571",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Delay status (MISSING)",
    Endpoint: `GET ${base}/api/whatsapp/orders/:id/delay-status`,
    Request: "STATUS: NOT BUILT. Ideal for revised ETA + reason.",
    Response: j({
      is_delayed: true,
      type: "pickup",
      reason: "traffic",
      new_eta: "2026-09-10T13:15:00+05:30",
      rider: { name: "Suresh K.", mobile: "9xxxxxxxxx" },
    }),
    "Bearer token required": "Yes (when built)",
  },
  {
    Step: 6,
    Name: "Talk to agent",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request:
      j({
        report_issue: "delay",
        message: "Pickup delayed — customer wants agent",
      }),
    Response: j({ success: true, message: "Help request submitted" }),
    "Bearer token required": "Yes",
  },
];

export const scenario12Rows = [
  ...authPair(1),
  {
    Step: 3,
    Name: "Identify order",
    Endpoint: `GET ${base}/api/user/order/getUserOrder`,
    Request: "Ask Booking ID / pick latest unpaid finalized order.",
    Response: j({
      status: 200,
      data: [{ order_id: 74, status: "order_finalized" }],
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 4,
    Name: "Retry payment",
    Endpoint: `POST ${base}/api/user/order/payment/:id/create-order`,
    Request:
      j({ amount: 1185.04, payment_type: "remaining" }) +
      "\n\nMenu: 1 Retry payment now | 2 Talk to support | 3 Wait for auto-reversal",
    Response: j({
      key_id: "rzp_live_xxx",
      order_id: "order_xxx",
      amount: 118504,
      currency: "INR",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Verify after retry",
    Endpoint: `POST ${base}/api/user/order/payment/:id/verify`,
    Request: j({
      razorpay_order_id: "order_xxx",
      razorpay_payment_id: "pay_yyy",
      razorpay_signature: "sig",
    }),
    Response: j({ verified: true }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Payment dispute ticket (MISSING)",
    Endpoint: `POST ${base}/api/whatsapp/payment-disputes`,
    Request:
      j({
        order_id: 74,
        type: "failed_but_deducted",
        transaction_ids: ["pay_xxx"],
      }) +
      "\n\nOr type: double_charged\nSTATUS: NOT BUILT — use needHelp until then.\nCopy: bank auto-reversal 5–7 days / ticket PAY-xxxx",
    Response: j({ ticket_id: "PAY-8820" }),
    "Bearer token required": "Yes (when built)",
  },
  {
    Step: 7,
    Name: "Fallback — needHelp",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request: j({
      report_issue: "payment_issue",
      message: "Payment failed but amount deducted / double charged",
    }),
    Response: j({ success: true }),
    "Bearer token required": "Yes",
  },
];

export const scenario13Rows = [
  {
    Step: 1,
    Name: "Trigger — low star rating",
    Endpoint: "— After delivery rating prompt —",
    Request: "Customer sends 1–2 stars.",
    Response: "Gallabox captures stars.",
    "Bearer token required": "No",
  },
  ...authPair(2),
  {
    Step: 4,
    Name: "Submit rating (MISSING)",
    Endpoint: `POST ${base}/api/whatsapp/orders/:id/rating`,
    Request:
      j({
        stars: 2,
        reason: "delay",
        comment: "Late delivery",
      }) +
      "\n\nReasons: quality | delay | damage | rider | other\nSTATUS: NOT BUILT.\nDamage/missing → Scenario complaint flow.\nElse escalate care team.",
    Response: j({ success: true, escalated: true }),
    "Bearer token required": "Yes (when built)",
  },
  {
    Step: 5,
    Name: "Escalate via needHelp",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request: j({
      report_issue: "negative_feedback",
      message: "2-star: delay in pickup/delivery",
    }),
    Response: j({ success: true }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "If damaged/missing → report-order",
    Endpoint: `POST ${base}/api/user/order/report-order`,
    Request:
      j({
        order_id: 74,
        issue_type: "missing",
        issue_reason: "shirt_missing",
        description: "One shirt missing from delivery",
      }) +
      "\n\nNote: API may restrict by payment/status — verify before Gallabox live.",
    Response: j({ success: true, message: "Issue reported" }),
    "Bearer token required": "Yes",
  },
];

export const scenario14Rows = [
  ...authPair(1),
  {
    Step: 3,
    Name: "Agent handoff (MISSING package)",
    Endpoint: `POST ${base}/api/whatsapp/agent-handoff`,
    Request:
      j({
        mobile: "9004186460",
        order_id: 74,
        reason: "customer_requested_agent",
        last_messages: ["I want to talk to a real person"],
      }) +
      "\n\nSTATUS: NOT BUILT.\nGallabox can hand off natively + call needHelp for ticket.",
    Response: j({ ticket_id: "AGT-1001", eta_minutes: 15 }),
    "Bearer token required": "Yes (when built)",
  },
  {
    Step: 4,
    Name: "needHelp (EXISTS)",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request:
      j({
        report_issue: "agent_request",
        message: "Customer requested live agent from WhatsApp",
      }) +
      "\n\nBot: \"Connecting you to a MetroGini care specialist… 10–15 min (9 AM–9 PM).\"\nWhile waiting: 1 Track order 2 Booking details 3 Wait",
    Response: j({ success: true }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Optional — track while waiting",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request: "If customer picks Track / booking details.",
    Response: j({ status: 200, data: { order_id: 74, status: "booked" } }),
    "Bearer token required": "Yes",
  },
];

export const scenario15Rows = [
  {
    Step: 1,
    Name: "Unrecognized input — re-show menu",
    Endpoint: "— Gallabox only —",
    Request:
      "First fallback: re-show relevant menu for current step (or main menu).\n1 Book | 2 Know more | 3 Existing Booking | 4 Talk to agent",
    Response: "No MetroGini API.",
    "Bearer token required": "No",
  },
  {
    Step: 2,
    Name: "Second unrecognized — escalate",
    Endpoint: `POST ${base}/api/user/needHelp`,
    Request:
      j({
        report_issue: "unrecognized_input",
        message: "Two consecutive unrecognized WhatsApp messages",
      }) + "\n\nOr Scenario 14 agent handoff.\nBot: \"Connecting you to a care specialist.\"",
    Response: j({ success: true }),
    "Bearer token required": "Yes (after OTP if session exists)",
  },
];

export const EXTRA_SHEETS = [
  {
    name: "Scenario 4",
    title: "Draft / abandoned booking (Push) — continue or new",
    rows: scenario4Rows,
  },
  {
    name: "Scenario 5",
    title: "Retention win-back (1 order, inactive) — VALUED10",
    rows: scenario5Rows,
  },
  {
    name: "Scenario 6",
    title: "Day of pickup reminder + rider assigned + reschedule/cancel",
    rows: scenario6Rows,
  },
  {
    name: "Scenario 7",
    title: "Pickup successful notification",
    rows: scenario7Rows,
  },
  {
    name: "Scenario 8",
    title: "Weight confirmed + Razorpay remaining payment",
    rows: scenario8Rows,
  },
  {
    name: "Scenario 9",
    title: "New / organic customer says Hi (generic or known name)",
    rows: scenario9Rows,
  },
  {
    name: "Scenario 10",
    title: "Existing customer Hi — book / know more / live status",
    rows: scenario10Rows,
  },
  {
    name: "Scenario 11",
    title: "Delayed pickup / delivery inquiry",
    rows: scenario11Rows,
  },
  {
    name: "Scenario 12",
    title: "Payment failed / double charged",
    rows: scenario12Rows,
  },
  {
    name: "Scenario 13",
    title: "Negative feedback (1–2 stars)",
    rows: scenario13Rows,
  },
  {
    name: "Scenario 14",
    title: "Human agent handoff",
    rows: scenario14Rows,
  },
  {
    name: "Scenario 15",
    title: "Unrecognized input / fallback",
    rows: scenario15Rows,
  },
];
