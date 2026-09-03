import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { EXTRA_SHEETS } from "./gallabox-scenarios-rest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = "https://api.metrogini.com";

const columns = [
  "Step",
  "Name",
  "Endpoint",
  "Request",
  "Response",
  "Bearer token required",
];

const j = (obj) => JSON.stringify(obj, null, 2);

const colWidths = [
  { wch: 8 },
  { wch: 48 },
  { wch: 78 },
  { wch: 64 },
  { wch: 64 },
  { wch: 24 },
];

const sheetFromRows = (dataRows) => {
  const ws = XLSX.utils.json_to_sheet(dataRows, { header: columns });
  ws["!cols"] = colWidths;
  return ws;
};

const scenario1Rows = [
  {
    Step: 1,
    Name: "Customer says Hi — send OTP",
    Endpoint: `POST ${base}/api/user/login-or-register`,
    Request:
      j({
        mobile: "9004186460",
      }) +
      "\n\nRequired: mobile (use WhatsApp number)\nOptional: none",
    Response: j({
      success: true,
      message: "OTP sent successfully",
      data: {
        id: 12,
        mobile: "9004186460",
        profile_completed: false,
        terms_and_condition: false,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 2,
    Name: "Verify OTP",
    Endpoint: `POST ${base}/api/user/verify-otp`,
    Request:
      j({
        mobile: "9004186460",
        otp: "1234",
      }) +
      "\n\nRequired: mobile, otp\nOptional: none\nNote: dummy mobile 9999988888 uses OTP 1234\nSave access_token for all later Bearer calls.",
    Response: j({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: "<jwt>",
        refresh_token: "<token>",
        expires_in: "7d",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 3,
    Name: "Enter pincode",
    Endpoint: `GET ${base}/api/common/pincode-check?pincode=400058`,
    Request:
      "No body.\nQuery required: pincode (6 digits)\nOptional: none\nNo Bearer.\n\nBot copy after Hi:\n\"Welcome to MetroGini (Wash by Kilo) ... please enter your pincode?\"\n\nChecks: pin in DB + serviceable + ACTIVE group + vendor&rider overlapping slots (next 7 days).",
    Response:
      "SERVICEABLE (continue to Step 4):\n" +
      j({
        success: true,
        message: "Pincode is serviceable",
        data: {
          serviceable: true,
          pincode: "400058",
          pincode_group_id: 1,
          group_code: "MUM_WEST",
          group_name: "Mumbai West",
          has_vendor_slots: true,
          has_rider_slots: true,
          message: null,
          code: null,
        },
      }) +
      "\n\nNOT SERVICEABLE (stop booking):\n" +
      j({
        success: true,
        message:
          "Service is coming soon in this pincode. Please try another address.",
        data: {
          serviceable: false,
          pincode: "400058",
          pincode_group_id: 14,
          group_code: "...",
          group_name: "...",
          has_vendor_slots: false,
          has_rider_slots: false,
          message:
            "Service is coming soon in this pincode. Please try another address.",
          code: "no_vendor_rider_slots",
        },
      }) +
      "\n\nBot copy: \"Sorry! We're not available in your area yet. But we're coming soon! Stay tuned.\"",
    "Bearer token required": "No",
  },
  {
    Step: 4,
    Name: "Enter full address",
    Endpoint: `POST ${base}/api/user/address`,
    Request:
      j({
        address_type: "home",
        complete_address: "A-204, Lotus Residency, Andheri West",
        floor: "204",
        landmark: "Near station",
        receiver_name: "Karthik",
        contact_number: "9004186460",
        latitude: "19.1197",
        longitude: "72.8468",
        pincode: "400058",
        name: "Karthik",
        email: "karthik@example.com",
      }) +
      "\n\nRequired: address_type (home|work|institute), floor, landmark, receiver_name (or name), contact_number, latitude, longitude, pincode\nOptional: complete_address, name, email\nUse pincode from Step 3. contact_number = WhatsApp number.\n\nIf pincode not serviceable, API returns 400:\n" +
      j({
        success: false,
        message:
          "Service is coming soon in this pincode. Please try another address.",
      }),
    Response: j({
      success: true,
      message: "Address added successfully",
      data: {
        address_id: 3,
        name: "Karthik",
        email: "karthik@example.com",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 5,
    Name: "Set this address as default",
    Endpoint: `PUT ${base}/api/user/address/default/:id`,
    Request:
      "No body.\nPath required: id = address_id from Step 4\nDraft order uses the selected (default) address.\nNot a separate chat question — call right after add-address.",
    Response: j({
      success: true,
      message: "Default address updated successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Menu after address (no API)",
    Endpoint: "— Gallabox menu only —",
    Request:
      "Bot copy:\n\"Thank you! What would you like to do next?\"\n1. Book for Wash by Kilo  → go to Step 7\n2. Know more about MetroGini  → go to Step 14",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  {
    Step: 7,
    Name: "Book — garment count",
    Endpoint: `POST ${base}/api/user/order/`,
    Request:
      j({
        service_id: 1,
        clothes_count: 15,
      }) +
      "\n\nRequired: service_id, clothes_count (min 10, max 25)\nOptional: none\n\nChat: dropdown starting from 10 garments.\nGet service_id from:\nGET " +
      `${base}/api/common/services?pincode=400058` +
      "\n(use Wash by Kilo id; pincode from Step 3)\n\nQuery optional on services: pincode OR pincode_group_id",
    Response: j({
      id: 74,
      order_id: "MG123456",
      estimated_weight_min: 5,
      estimated_weight_max: 7,
      message: "Order created successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 8,
    Name: "Pickup date — Tomorrow / Day after tomorrow",
    Endpoint: `GET ${base}/api/common/slots/availability?pincode=400058&days=7`,
    Request:
      "No body.\nRequired: pincode (from Step 3) OR pincodeGroupId\nOptional: days (default 7)\n\nChat options:\n1. Tomorrow <dynamic date>\n2. Day after tomorrow <dynamic date>\nPick a date from availability[] where slots[].available = true.\nSave shift_id from the chosen slot.",
    Response: j({
      success: true,
      message: "Slot availability retrieved successfully",
      data: {
        pincodeGroupId: 1,
        days: 7,
        availability: [
          {
            date: "2026-09-10",
            day: "Thursday",
            slots: [
              {
                shiftId: 1,
                shiftName: "Morning",
                laundryId: 12,
                available: true,
                remaining: 5,
              },
            ],
          },
        ],
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 9,
    Name: "Save pickup + delivery (72 hours)",
    Endpoint: `POST ${base}/api/user/order/:id/complete-order`,
    Request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) +
      "\n\nRequired: service_type_id, pickup_date (future YYYY-MM-DD), pickup_slot_id, next_delivery_date (after pickup)\nOptional: none\nChat does not ask service type — use Standard:\nGET " +
      `${base}/api/common/service-types` +
      "\nDelivery = pickup + 72 hours.\nPath :id = draft order id from Step 7.\nStatus stays draft until Step 11.",
    Response: j({
      message: "Order completed successfully",
      order_id: "74",
      delivery_date: "2026-09-13",
      estimated_total: "860.00",
      booked_at: "2026-09-03T10:00:00.000Z",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 10,
    Name: "Review estimate (loyalty coupon auto-applied)",
    Endpoint: `GET ${base}/api/user/order/:id/review`,
    Request:
      "No body.\nPath required: id = order id\nUse this payload to build the confirmation message (pickup, delivery, garment count).\nAuto-applies FIRST15 (first 2 orders) or per-kg coupon (3rd+).",
    Response: j({
      order_id: "74",
      service_details: {
        service_name: "Wash by Kilo",
        service_type: "Standard Service",
        clothes_count: 15,
        estimated_weight_range: "5.00 - 7.00 kg",
      },
      schedule: {
        pickup: { date: "2026-09-10", slot: "09:00:00 - 21:30:00" },
        delivery: { date: "2026-09-13", slot: "09:00:00 - 21:30:00" },
      },
      address: "A-204, Lotus Residency, Andheri West",
      pricing_breakdown: {
        flat_fee: "100.00",
        service_charge: "1260.00",
        peak_charge: "0.00",
        coupon: {
          coupon_code: "FIRST15",
          discount_type: "percentage",
          discount_value: "15.00",
        },
        discount: "204.00",
        advance_payment: "0.00",
        remaining_payment: "1156.00",
        total_payable_now: "0.00",
        approx_total: "1156.00",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 11,
    Name: "Confirm booking (no advance)",
    Endpoint: `POST ${base}/api/user/order/payment/:id/pay`,
    Request:
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) +
      "\n\nRequired: group_code (from Step 3 pincode), shift_id (from Step 8), day_of_week (1=Mon … 7=Sun of pickup_date)\nOptional: none\nAmount charged is ₹0. This confirms booking and assigns vendor + rider.\n\nBot copy after success:\n\"Excellent. Your laundry will be processed within 72 hours...\"\n\"To cancel your order, press C\"",
    Response: j({
      message: "Payment successful. Order booked.",
      order_id: 74,
      assigned_vendor: 12,
      assigned_rider: 5,
      user_pincode: "400058",
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 12,
    Name: "Cancel — customer presses C",
    Endpoint: `POST ${base}/api/user/order/:id/cancelService`,
    Request:
      j({
        reason_type: "changed_mind",
        reason_description: "Customer pressed C on WhatsApp",
      }) +
      "\n\nRequired: reason_type — pickup_schedule_issue | modify_order | service_charge_incorrect | changed_mind | other\nOptional: reason_description (required only if reason_type = other)\nOnly status=booked, and only if pickup is more than 12 hours away.\n\nBot copy: \"Your booking at MetroGini is cancelled. Please feel free to connect with us anytime for hassle-free garment care.\"",
    Response: j({
      message: "Order cancelled successfully.",
      data: {},
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 13,
    Name: "Know more — FAQ",
    Endpoint: `GET ${base}/api/common/faq`,
    Request:
      "No body.\nQuery: none\nChat: customer selects Know more → FAQ. Show all questions/answers.",
    Response: j({
      success: true,
      message: "FAQ retrieved successfully",
      data: [
        {
          id: 1,
          question: "How does MetroGini work?",
          answer: "...",
          sequence: 1,
        },
      ],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 14,
    Name: "Know more — How MetroGini Works",
    Endpoint: `GET ${base}/api/common/how-we-work`,
    Request:
      "No body.\nQuery: none\nChat: show illustration images from the app.",
    Response: j({
      success: true,
      message: "How we work items retrieved successfully",
      data: [{ id: 1, heading: "Pickup", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 15,
    Name: "Know more — View pricing",
    Endpoint: `GET ${base}/api/common/know-about-us`,
    Request:
      "No body.\nQuery: none\nChat: show know-your-weight / know-your-price images.\nZone prices (optional extra):\nGET " +
      `${base}/api/common/services?pincode=400058`,
    Response: j({
      success: true,
      message: "Know about us items retrieved successfully",
      data: [
        {
          id: 1,
          title: "Wash by Kilo",
          description: "...",
          image: "https://...",
          sequence: 1,
        },
      ],
    }),
    "Bearer token required": "No",
  },
];

/** Scenario 2 — App Downloaded (push), no first booking yet */
const scenario2Rows = [
  {
    Step: 1,
    Name: "Find users to nudge (CRM — MISSING)",
    Endpoint: `GET ${base}/api/whatsapp/crm/inactive-app-users?hours=48`,
    Request:
      "Query optional: hours (default 48)\nTrigger: app downloaded, zero completed bookings, 24–48 hrs idle.\n\nSTATUS: NOT BUILT YET — Gallabox can use their own segment / Meta audience until this exists.",
    Response: j({
      success: true,
      data: [
        {
          mobile: "9004186460",
          user_id: 12,
          full_name: "Karthik",
          has_app: true,
          total_orders: 0,
          installed_at: "2026-09-01T10:00:00.000Z",
        },
      ],
    }),
    "Bearer token required": "Admin / System (when built)",
  },
  {
    Step: 2,
    Name: "Outbound WhatsApp push (Gallabox template)",
    Endpoint: "— Gallabox template only — no MetroGini API —",
    Request:
      "AI-initiated template:\n\"Hi 👋 Welcome to MetroGini (Wash by Kilo)! Thanks for downloading our app — looks like you haven't booked your first wash yet. Get 15% off your first order when you book today 🎉 Use code FIRST15\"\n1. Book for Wash by Kilo\n2. Know more about MetroGini",
    Response: "Delivered via WhatsApp / Gallabox. No backend response.",
    "Bearer token required": "No",
  },
  {
    Step: 3,
    Name: "Customer replies — send OTP",
    Endpoint: `POST ${base}/api/user/login-or-register`,
    Request:
      j({
        mobile: "9004186460",
      }) +
      "\n\nRequired: mobile (WhatsApp number)\nOptional: none\nCustomer already has app account — same login API.",
    Response: j({
      success: true,
      message: "OTP sent successfully",
      data: {
        id: 12,
        mobile: "9004186460",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 4,
    Name: "Verify OTP",
    Endpoint: `POST ${base}/api/user/verify-otp`,
    Request:
      j({
        mobile: "9004186460",
        otp: "1234",
      }) +
      "\n\nRequired: mobile, otp\nSave access_token for Bearer calls.",
    Response: j({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: "<jwt>",
        refresh_token: "<token>",
        expires_in: "7d",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 5,
    Name: "Get profile (confirm app user / zero bookings)",
    Endpoint: `GET ${base}/api/user/profile`,
    Request:
      "No body.\nUse to personalise and confirm current_orders is empty (first wash nudge).",
    Response: j({
      success: true,
      message: "Profile fetched successfully",
      data: {
        id: 12,
        mobile: "9004186460",
        full_name: "Karthik",
        email: "karthik@example.com",
        profile_completed: true,
        current_orders: [],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 6,
    Name: "Menu after push (no API)",
    Endpoint: "— Gallabox menu only —",
    Request:
      "1. Book for Wash by Kilo → Step 7\n2. Know more about MetroGini → Step 14 (same content as Scenario 1 Know more)\nOffer: FIRST15 (15% first order) — auto-applies on review if eligible.",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  {
    Step: 7,
    Name: "Book — enter pincode",
    Endpoint: `GET ${base}/api/common/pincode-check?pincode=400058`,
    Request:
      "No body.\nQuery required: pincode\nSame bookable rules as Scenario 1 (pin + ACTIVE group + vendor&rider slots).",
    Response:
      "SERVICEABLE:\n" +
      j({
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
      }) +
      "\n\nNOT SERVICEABLE: data.serviceable=false → coming soon copy. Stop.",
    "Bearer token required": "No",
  },
  {
    Step: 8,
    Name: "List saved addresses (app may already have one)",
    Endpoint: `GET ${base}/api/user/address`,
    Request:
      "No body.\nIf a selected address exists for this pincode, skip add-address.\nIf none / wrong pin → Step 9.",
    Response: j({
      success: true,
      message: "Addresses retrieved successfully",
      data: {
        addresses: [
          {
            id: 3,
            address_type: "home",
            complete_address: "A-204, Lotus Residency, Andheri West",
            pincode: "400058",
            is_selected: true,
          },
        ],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 9,
    Name: "Enter full address (only if none / change needed)",
    Endpoint: `POST ${base}/api/user/address`,
    Request:
      j({
        address_type: "home",
        complete_address: "A-204, Lotus Residency, Andheri West",
        floor: "204",
        landmark: "Near station",
        receiver_name: "Karthik",
        contact_number: "9004186460",
        latitude: "19.1197",
        longitude: "72.8468",
        pincode: "400058",
      }) +
      "\n\nRequired: address_type, floor, landmark, receiver_name (or name), contact_number, latitude, longitude, pincode\nOptional: complete_address, name, email\nThen: PUT " +
      `${base}/api/user/address/default/:id`,
    Response: j({
      success: true,
      message: "Address added successfully",
      data: { address_id: 3 },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 10,
    Name: "Book — garment count",
    Endpoint: `POST ${base}/api/user/order/`,
    Request:
      j({
        service_id: 1,
        clothes_count: 15,
      }) +
      "\n\nRequired: service_id, clothes_count (10–25)\nGet service_id: GET " +
      `${base}/api/common/services?pincode=400058` +
      "\nNudge: FIRST15 / Bulk15 shown in chat.",
    Response: j({
      id: 74,
      order_id: "MG123456",
      estimated_weight_min: 5,
      estimated_weight_max: 7,
      message: "Order created successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 11,
    Name: "Pickup date — Tomorrow / Day after",
    Endpoint: `GET ${base}/api/common/slots/availability?pincode=400058&days=7`,
    Request:
      "No body.\nRequired: pincode OR pincodeGroupId\nOptional: days\nPick date with slots[].available=true. Save shiftId.",
    Response: j({
      success: true,
      data: {
        pincodeGroupId: 1,
        availability: [
          {
            date: "2026-09-10",
            day: "Thursday",
            slots: [
              {
                shiftId: 1,
                shiftName: "Morning",
                laundryId: 12,
                available: true,
                remaining: 5,
              },
            ],
          },
        ],
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 12,
    Name: "Save pickup + delivery (72 hours)",
    Endpoint: `POST ${base}/api/user/order/:id/complete-order`,
    Request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) +
      "\n\nRequired: service_type_id, pickup_date, pickup_slot_id, next_delivery_date\nStandard service: GET " +
      `${base}/api/common/service-types`,
    Response: j({
      message: "Order completed successfully",
      order_id: "74",
      delivery_date: "2026-09-13",
      estimated_total: "860.00",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 13,
    Name: "Review + confirm booking (₹0 + FIRST15 auto)",
    Endpoint: `GET ${base}/api/user/order/:id/review` +
      "\nthen\n" +
      `POST ${base}/api/user/order/payment/:id/pay`,
    Request:
      "Review: no body. FIRST15 auto-applies on first orders.\nPay body:\n" +
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) +
      "\n\nRequired on pay: group_code, shift_id, day_of_week\nAmount ₹0. Confirms booking + vendor/rider.\nCancel later: press C → POST .../cancelService (see Scenario 1 Step 12).",
    Response: j({
      message: "Payment successful. Order booked.",
      order_id: 74,
      assigned_vendor: 12,
      assigned_rider: 5,
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 14,
    Name: "Know more — FAQ",
    Endpoint: `GET ${base}/api/common/faq`,
    Request:
      "No body.\nDoc note: if customer selects Know more → same as Scenario 1.",
    Response: j({
      success: true,
      message: "FAQ retrieved successfully",
      data: [{ id: 1, question: "...", answer: "...", sequence: 1 }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 15,
    Name: "Know more — How MetroGini Works",
    Endpoint: `GET ${base}/api/common/how-we-work`,
    Request: "No body.\nShow illustration images.",
    Response: j({
      success: true,
      data: [{ id: 1, heading: "Pickup", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 16,
    Name: "Know more — View pricing",
    Endpoint: `GET ${base}/api/common/know-about-us`,
    Request:
      "No body.\nOptional zone prices: GET " +
      `${base}/api/common/services?pincode=400058`,
    Response: j({
      success: true,
      data: [
        {
          id: 1,
          title: "Wash by Kilo",
          description: "...",
          image: "https://...",
        },
      ],
    }),
    "Bearer token required": "No",
  },
];

/** Scenario 3 — Registered customer reaches out (Send) */
const scenario3Rows = [
  {
    Step: 1,
    Name: "Customer says Hi — send OTP",
    Endpoint: `POST ${base}/api/user/login-or-register`,
    Request:
      j({
        mobile: "9004186460",
      }) +
      "\n\nRequired: mobile (WhatsApp number)\nRegistered app customer messaging first (not a push).",
    Response: j({
      success: true,
      message: "OTP sent successfully",
      data: {
        id: 10482,
        mobile: "9004186460",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 2,
    Name: "Verify OTP",
    Endpoint: `POST ${base}/api/user/verify-otp`,
    Request:
      j({
        mobile: "9004186460",
        otp: "1234",
      }) +
      "\n\nRequired: mobile, otp\nSave access_token.",
    Response: j({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: "<jwt>",
        refresh_token: "<token>",
        expires_in: "7d",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 3,
    Name: "Get profile — show Customer ID",
    Endpoint: `GET ${base}/api/user/profile`,
    Request:
      "No body.\nBot copy:\n\"Welcome to MetroGini (Wash by Kilo) Thank you for downloading our MetroGini app! Your Customer ID is: MG-{id}\"\nFormat Customer ID in Gallabox as MG-{profile.id} (e.g. MG-10482).",
    Response: j({
      success: true,
      message: "Profile fetched successfully",
      data: {
        id: 10482,
        mobile: "9004186460",
        full_name: "Karthik",
        email: "karthik@example.com",
        profile_completed: true,
        current_orders: [],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 4,
    Name: "Main menu (no API)",
    Endpoint: "— Gallabox menu only —",
    Request:
      "1. Book for Wash by Kilo → Step 5\n2. Know more about MetroGini → Step 13\n3. Know about Existing Booking → Step 16",
    Response: "No backend call.",
    "Bearer token required": "No",
  },
  {
    Step: 5,
    Name: "Book — enter pincode",
    Endpoint: `GET ${base}/api/common/pincode-check?pincode=400058`,
    Request:
      "No body.\nQuery required: pincode\nSame bookable check as Scenario 1.",
    Response:
      "SERVICEABLE → continue.\nNOT SERVICEABLE → coming soon; stop.\n" +
      j({
        success: true,
        message: "Pincode is serviceable",
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
    Step: 6,
    Name: "List saved addresses",
    Endpoint: `GET ${base}/api/user/address`,
    Request:
      "No body.\nRegistered user often already has an address from the app.\nIf selected address matches pincode → set default if needed, skip add.\nElse → Step 7.",
    Response: j({
      success: true,
      message: "Addresses retrieved successfully",
      data: {
        addresses: [
          {
            id: 3,
            address_type: "home",
            complete_address: "A-204, Lotus Residency, Andheri West",
            pincode: "400058",
            is_selected: true,
          },
        ],
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 7,
    Name: "Enter / change address (only if needed)",
    Endpoint: `POST ${base}/api/user/address`,
    Request:
      j({
        address_type: "home",
        complete_address: "A-204, Lotus Residency, Andheri West",
        floor: "204",
        landmark: "Near station",
        receiver_name: "Karthik",
        contact_number: "9004186460",
        latitude: "19.1197",
        longitude: "72.8468",
        pincode: "400058",
      }) +
      "\n\nThen PUT " +
      `${base}/api/user/address/default/:id` +
      "\nSkip this step if Step 6 already has a usable default address.",
    Response: j({
      success: true,
      message: "Address added successfully",
      data: { address_id: 3 },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 8,
    Name: "Book — garment count",
    Endpoint: `POST ${base}/api/user/order/`,
    Request:
      j({
        service_id: 1,
        clothes_count: 15,
      }) +
      "\n\nRequired: service_id, clothes_count (10–25)\nservice_id from GET " +
      `${base}/api/common/services?pincode=400058` +
      "\nDoc: same booking flow as Scenario 1 (garment → pickup → confirm).",
    Response: j({
      id: 74,
      order_id: "MG123456",
      estimated_weight_min: 5,
      estimated_weight_max: 7,
      message: "Order created successfully",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 9,
    Name: "Pickup date — Tomorrow / Day after",
    Endpoint: `GET ${base}/api/common/slots/availability?pincode=400058&days=7`,
    Request:
      "No body.\nRequired: pincode OR pincodeGroupId\nPick available date + shiftId.",
    Response: j({
      success: true,
      data: {
        pincodeGroupId: 1,
        availability: [
          {
            date: "2026-09-10",
            day: "Thursday",
            slots: [
              {
                shiftId: 1,
                shiftName: "Morning",
                laundryId: 12,
                available: true,
                remaining: 5,
              },
            ],
          },
        ],
      },
    }),
    "Bearer token required": "No",
  },
  {
    Step: 10,
    Name: "Save pickup + delivery (72 hours)",
    Endpoint: `POST ${base}/api/user/order/:id/complete-order`,
    Request:
      j({
        service_type_id: 1,
        pickup_date: "2026-09-10",
        pickup_slot_id: 1,
        next_delivery_date: "2026-09-13",
      }) +
      "\n\nRequired: service_type_id, pickup_date, pickup_slot_id, next_delivery_date\nStandard: GET " +
      `${base}/api/common/service-types`,
    Response: j({
      message: "Order completed successfully",
      order_id: "74",
      delivery_date: "2026-09-13",
      estimated_total: "860.00",
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 11,
    Name: "Review estimate (loyalty auto)",
    Endpoint: `GET ${base}/api/user/order/:id/review`,
    Request:
      "No body.\nFIRST15 if first orders; per-kg loyalty if 3rd+.",
    Response: j({
      order_id: "74",
      pricing_breakdown: {
        coupon: { coupon_code: "FIRST15", discount_type: "percentage" },
        advance_payment: "0.00",
        total_payable_now: "0.00",
        approx_total: "1156.00",
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 12,
    Name: "Confirm booking (no advance)",
    Endpoint: `POST ${base}/api/user/order/payment/:id/pay`,
    Request:
      j({
        group_code: "MUM_WEST",
        shift_id: 1,
        day_of_week: 3,
      }) +
      "\n\nRequired: group_code, shift_id, day_of_week\n₹0 pay confirms booking.\nCancel: press C → POST .../cancelService (Scenario 1 Step 12).",
    Response: j({
      message: "Payment successful. Order booked.",
      order_id: 74,
      assigned_vendor: 12,
      assigned_rider: 5,
      advance_paid: 0,
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 13,
    Name: "Know more — FAQ",
    Endpoint: `GET ${base}/api/common/faq`,
    Request: "No body.\nSame Know more block as Scenario 1.",
    Response: j({
      success: true,
      data: [{ id: 1, question: "...", answer: "...", sequence: 1 }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 14,
    Name: "Know more — How MetroGini Works",
    Endpoint: `GET ${base}/api/common/how-we-work`,
    Request: "No body.",
    Response: j({
      success: true,
      data: [{ id: 1, heading: "Pickup", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 15,
    Name: "Know more — View pricing",
    Endpoint: `GET ${base}/api/common/know-about-us`,
    Request:
      "No body.\nOptional: GET " +
      `${base}/api/common/services?pincode=400058`,
    Response: j({
      success: true,
      data: [{ id: 1, title: "Wash by Kilo", image: "https://..." }],
    }),
    "Bearer token required": "No",
  },
  {
    Step: 16,
    Name: "Existing booking — list orders",
    Endpoint: `GET ${base}/api/user/order/getUserOrder`,
    Request:
      "No body.\nQuery optional: status (booked|out_for_pickup|...|delivered|cancelled), page, limit\nUse latest active order for chat status.\nIf empty → \"No active booking found.\"",
    Response: j({
      status: 200,
      message: "Orders fetched successfully",
      data: [
        {
          order_id: 74,
          status: "booked",
          service_name: "Wash by Kilo",
          clothes_count: 15,
          pickup_date: "2026-09-10",
          delivery_date: "2026-09-13",
        },
      ],
      pagination: {
        total: 1,
        current_page: 1,
        total_pages: 1,
        per_page: 10,
      },
    }),
    "Bearer token required": "Yes",
  },
  {
    Step: 17,
    Name: "Existing booking — order detail / live stage",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request:
      "No body.\nPath: id = order_id from Step 16\nMap status to WhatsApp stage copy (booked → rider assigned → picked up → …).",
    Response: j({
      status: 200,
      message: "Order fetched successfully",
      data: {
        order_id: 74,
        order_code: "MG24571",
        status: "booked",
        clothes_count: 15,
        pickup_date: "2026-09-10",
        delivery_date: "2026-09-13",
        payment_status: "pending",
        amount_paid: 0,
        final_total: null,
        remaining_amount: null,
      },
    }),
    "Bearer token required": "Yes",
  },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheetFromRows(scenario1Rows), "Scenario 1");
XLSX.utils.book_append_sheet(wb, sheetFromRows(scenario2Rows), "Scenario 2");
XLSX.utils.book_append_sheet(wb, sheetFromRows(scenario3Rows), "Scenario 3");
for (const sheet of EXTRA_SHEETS) {
  XLSX.utils.book_append_sheet(wb, sheetFromRows(sheet.rows), sheet.name);
}

const introRows = [
  ["MetroGini × Gallabox — All WhatsApp Scenarios"],
  ["Base URL", base],
  [
    "Auth",
    "Where Bearer = Yes: Authorization: Bearer <access_token> from verify-otp",
  ],
  ["Single file", "One workbook — one sheet per scenario + Read me"],
  ["Scenario 1", "New customer (Send): Hi → OTP → pincode → address → Book / Know more"],
  ["Scenario 2", "App downloaded (Push): outbound nudge → Book / Know more → FIRST15"],
  ["Scenario 3", "Registered customer (Send): Hi → Customer ID → Book / Know more / Existing"],
  ["Scenario 4", "Abandoned draft (Push): Continue / New / Know more"],
  ["Scenario 5", "Retention win-back (Push): VALUED10 + saved address"],
  ["Scenario 6", "Day of pickup + rider assigned + reschedule/cancel"],
  ["Scenario 7", "Pickup successful notification"],
  ["Scenario 8", "Weight confirmed + Razorpay remaining payment"],
  ["Scenario 9", "New/organic Hi (generic or known name)"],
  ["Scenario 10", "Existing customer Hi + live order status"],
  ["Scenario 11", "Delayed pickup / delivery inquiry"],
  ["Scenario 12", "Payment failed / double charged"],
  ["Scenario 13", "Negative feedback 1–2 stars"],
  ["Scenario 14", "Human agent handoff"],
  ["Scenario 15", "Unrecognized input / fallback"],
  ["No advance at booking", "POST /payment/:id/pay with ₹0"],
  ["Pincode gate", "GET /api/common/pincode-check (bookable = pin + group + vendor + rider)"],
  [
    "MISSING (build later)",
    "CRM segments, outbound order webhooks to Gallabox, customer lookup, delay-status, complaints/rating/handoff packages",
  ],
  ["Footer", "App download UTM on every message"],
];
const intro = XLSX.utils.aoa_to_sheet(introRows);
intro["!cols"] = [{ wch: 28 }, { wch: 110 }];
XLSX.utils.book_append_sheet(wb, intro, "Read me");

const outPath = join(__dirname, "..", "gallabox_scenarios.xlsx");
try {
  XLSX.writeFile(wb, outPath);
  console.log(`Created: ${outPath}`);
  console.log(
    `Sheets: Scenario 1–3 + ${EXTRA_SHEETS.map((s) => s.name).join(", ")} + Read me`,
  );
} catch (err) {
  if (err.code === "EBUSY") {
    console.error(`File is open in Excel. Close ${outPath} and run again.`);
    process.exit(1);
  }
  throw err;
}
