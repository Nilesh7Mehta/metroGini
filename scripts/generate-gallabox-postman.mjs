/**
 * Generates Gallabox_WhatsApp_Scenarios.postman_collection.json
 * Covers Scenarios 1–11 + WhatsApp missing APIs.
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "Gallabox_WhatsApp_Scenarios.postman_collection.json");

const bearerUser = {
  type: "bearer",
  bearer: [{ key: "token", value: "{{token}}", type: "string" }],
};

const gallaboxHeader = [
  {
    key: "X-Gallabox-Secret",
    value: "{{whatsappSecret}}",
    type: "text",
  },
  { key: "Content-Type", value: "application/json", type: "text" },
];

const req = ({
  name,
  method,
  path,
  query,
  body,
  auth,
  description,
  headers,
  events,
}) => {
  const pathParts = path.replace(/^\//, "").split("/").filter(Boolean);
  const item = {
    name,
    request: {
      method,
      header: headers || (auth === "user" ? [] : auth === "whatsapp" ? gallaboxHeader : []),
      url: {
        raw:
          `{{baseUrl}}api/${path.replace(/^\//, "")}` +
          (query?.length
            ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}`
            : ""),
        host: ["{{baseUrl}}api"],
        path: pathParts,
        ...(query?.length ? { query } : {}),
      },
      description: description || "",
    },
    response: [],
  };

  if (auth === "user") {
    item.request.auth = bearerUser;
    item.request.header = [
      { key: "Content-Type", value: "application/json", type: "text" },
    ];
  }

  if (body != null) {
    item.request.body = {
      mode: "raw",
      raw: typeof body === "string" ? body : JSON.stringify(body, null, 2),
      options: { raw: { language: "json" } },
    };
  }

  if (events) item.event = events;

  return item;
};

const saveTokenEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code >= 200 && pm.response.code < 300) {",
        "  const json = pm.response.json();",
        "  const data = json.data || json;",
        "  if (data.access_token) pm.collectionVariables.set('token', data.access_token);",
        "  if (data.refresh_token) pm.collectionVariables.set('refreshToken', data.refresh_token);",
        "  if (data.user_id) pm.collectionVariables.set('userId', String(data.user_id));",
        "  if (data.active_order_id) pm.collectionVariables.set('orderId', String(data.active_order_id));",
        "  if (data.draft_order_id) pm.collectionVariables.set('draftOrderId', String(data.draft_order_id));",
        "}",
      ],
    },
  },
];

const saveOrderEvents = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code >= 200 && pm.response.code < 300) {",
        "  const json = pm.response.json();",
        "  const id = json.id || json.order_id || (json.data && (json.data.order_id || json.data.id));",
        "  if (id) pm.collectionVariables.set('orderId', String(id));",
        "}",
      ],
    },
  },
];

const folder = (name, description, item) => ({
  name,
  description: description || "",
  item,
});

const bookChain = [
  req({
    name: "Pincode check",
    method: "GET",
    path: "common/pincode-check",
    query: [{ key: "pincode", value: "{{pincode}}" }],
    description: "Bookable check: pin + ACTIVE group + vendor&rider slots",
  }),
  req({
    name: "List addresses",
    method: "GET",
    path: "user/address",
    auth: "user",
  }),
  req({
    name: "Add address",
    method: "POST",
    path: "user/address",
    auth: "user",
    body: {
      address_type: "home",
      complete_address: "A-204, Lotus Residency, Andheri West",
      floor: "204",
      landmark: "Near station",
      receiver_name: "Karthik",
      contact_number: "{{mobile}}",
      latitude: "19.1197",
      longitude: "72.8468",
      pincode: "{{pincode}}",
    },
  }),
  req({
    name: "Set default address",
    method: "PUT",
    path: "user/address/default/{{addressId}}",
    auth: "user",
  }),
  req({
    name: "Services (get service_id)",
    method: "GET",
    path: "common/services",
    query: [{ key: "pincode", value: "{{pincode}}" }],
  }),
  req({
    name: "Create draft order",
    method: "POST",
    path: "user/order/",
    auth: "user",
    body: { service_id: 1, clothes_count: 15 },
    events: saveOrderEvents,
  }),
  req({
    name: "Slots availability",
    method: "GET",
    path: "common/slots/availability",
    query: [
      { key: "pincode", value: "{{pincode}}" },
      { key: "days", value: "7" },
    ],
  }),
  req({
    name: "Complete order",
    method: "POST",
    path: "user/order/{{orderId}}/complete-order",
    auth: "user",
    body: {
      service_type_id: 1,
      pickup_date: "2026-09-10",
      pickup_slot_id: 1,
      next_delivery_date: "2026-09-13",
    },
  }),
  req({
    name: "Review (loyalty auto)",
    method: "GET",
    path: "user/order/{{orderId}}/review",
    auth: "user",
  }),
  req({
    name: "Confirm booking pay ₹0",
    method: "POST",
    path: "user/order/payment/{{orderId}}/pay",
    auth: "user",
    body: {
      group_code: "{{groupCode}}",
      shift_id: 1,
      day_of_week: 3,
    },
  }),
];

const knowMore = [
  req({ name: "FAQ", method: "GET", path: "common/faq" }),
  req({ name: "How we work", method: "GET", path: "common/how-we-work" }),
  req({ name: "Know about us / pricing", method: "GET", path: "common/know-about-us" }),
];

const collection = {
  info: {
    _postman_id: "gallabox-whatsapp-scenarios-001",
    name: "Gallabox WhatsApp Scenarios 1–11",
    description:
      "MetroGini × Gallabox WhatsApp flows.\n\n" +
      "Auth (easy path): POST /api/whatsapp/session with header X-Gallabox-Secret → saves {{token}}.\n" +
      "Set collection vars: baseUrl, whatsappSecret, mobile, pincode, groupCode.\n" +
      "Legacy OTP still available under Shared.\n" +
      "Outbound: set GALLABOX_WEBHOOK_URL on server; test via WhatsApp APIs → Emit event.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "https://api.metrogini.com/" },
    { key: "whatsappSecret", value: "change-me-gallabox-secret" },
    { key: "token", value: "" },
    { key: "refreshToken", value: "" },
    { key: "mobile", value: "9004186460" },
    { key: "pincode", value: "400058" },
    { key: "groupCode", value: "MUM_WEST" },
    { key: "orderId", value: "1" },
    { key: "draftOrderId", value: "1" },
    { key: "addressId", value: "1" },
    { key: "userId", value: "1" },
  ],
  item: [
    folder(
      "0. WhatsApp APIs (new)",
      "Missing APIs built for Gallabox — require X-Gallabox-Secret",
      [
        req({
          name: "Create session (no OTP)",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
          description:
            "Primary auth for WhatsApp. Uses WhatsApp number → JWT. No OTP.",
        }),
        req({
          name: "Customer lookup",
          method: "POST",
          path: "whatsapp/customer/lookup",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          description: "Soft lookup — exists, name, orders, address. No token.",
        }),
        req({
          name: "CRM — inactive app users",
          method: "GET",
          path: "whatsapp/crm/inactive-app-users",
          auth: "whatsapp",
          query: [
            { key: "hours", value: "48" },
            { key: "limit", value: "100" },
          ],
          description: "Scenario 2 push audience: users.role=user, 0 completed orders, created_at older than hours",
        }),
        req({
          name: "CRM — winback",
          method: "GET",
          path: "whatsapp/crm/winback",
          auth: "whatsapp",
          query: [
            { key: "days", value: "30" },
            { key: "total_orders", value: "1" },
            { key: "limit", value: "100" },
          ],
          description: "Scenario 5 push audience",
        }),
        req({
          name: "Abandoned booking",
          method: "GET",
          path: "whatsapp/customer/{{mobile}}/abandoned-booking",
          auth: "whatsapp",
          description: "Scenario 4 continue booking",
        }),
        req({
          name: "Active order by mobile",
          method: "GET",
          path: "whatsapp/orders/active-by-mobile",
          auth: "whatsapp",
          query: [{ key: "mobile", value: "{{mobile}}" }],
        }),
        req({
          name: "Order rider",
          method: "GET",
          path: "whatsapp/orders/{{orderId}}/rider",
          auth: "whatsapp",
        }),
        req({
          name: "Delay status",
          method: "GET",
          path: "whatsapp/orders/{{orderId}}/delay-status",
          auth: "whatsapp",
        }),
        req({
          name: "Emit event to Gallabox (test)",
          method: "POST",
          path: "whatsapp/events/emit",
          auth: "whatsapp",
          body: {
            event: "pickup_day_reminder",
            order_id: 1,
            data: { note: "manual test" },
          },
          description:
            "Requires GALLABOX_WEBHOOK_ENABLED=true and GALLABOX_WEBHOOK_URL on server",
        }),
      ],
    ),
    folder("Shared — OTP fallback (optional)", "Use only if session secret not used", [
      req({
        name: "Login or register",
        method: "POST",
        path: "user/login-or-register",
        body: { mobile: "{{mobile}}" },
      }),
      req({
        name: "Verify OTP",
        method: "POST",
        path: "user/verify-otp",
        body: { mobile: "{{mobile}}", otp: "1234" },
        events: saveTokenEvents,
      }),
      req({
        name: "Get profile",
        method: "GET",
        path: "user/profile",
        auth: "user",
      }),
    ]),
    folder(
      "Scenario 1 — New customer (Send)",
      "Hi → session → pincode → address → Book / Know more",
      [
        req({
          name: "1. Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        ...bookChain,
        ...knowMore,
        req({
          name: "Cancel (press C)",
          method: "POST",
          path: "user/order/{{orderId}}/cancelService",
          auth: "user",
          body: {
            reason_type: "changed_mind",
            reason_description: "Customer pressed C on WhatsApp",
          },
        }),
      ],
    ),
    folder(
      "Scenario 2 — App downloaded (Push)",
      "CRM list → Gallabox template → session → book / know more",
      [
        req({
          name: "1. CRM inactive app users",
          method: "GET",
          path: "whatsapp/crm/inactive-app-users",
          auth: "whatsapp",
          query: [{ key: "hours", value: "48" }],
        }),
        req({
          name: "2. Session after reply",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        ...bookChain.slice(0, 6),
        ...bookChain.slice(6),
        ...knowMore,
      ],
    ),
    folder(
      "Scenario 3 — Registered customer (Send)",
      "Session → Customer ID → Book / Know more / Existing",
      [
        req({
          name: "1. Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
          description: "Show Customer ID as data.customer_id (MG-{id})",
        }),
        req({
          name: "2. Lookup (optional)",
          method: "POST",
          path: "whatsapp/customer/lookup",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
        }),
        ...bookChain,
        ...knowMore,
        req({
          name: "Existing — list orders",
          method: "GET",
          path: "user/order/getUserOrder",
          auth: "user",
        }),
        req({
          name: "Existing — order detail",
          method: "GET",
          path: "user/order/{{orderId}}/Orderdetail",
          auth: "user",
        }),
        req({
          name: "Existing — active by mobile",
          method: "GET",
          path: "whatsapp/orders/active-by-mobile",
          auth: "whatsapp",
          query: [{ key: "mobile", value: "{{mobile}}" }],
        }),
      ],
    ),
    folder(
      "Scenario 4 — Abandoned draft (Push)",
      "Continue draft or start new",
      [
        req({
          name: "1. Abandoned booking",
          method: "GET",
          path: "whatsapp/customer/{{mobile}}/abandoned-booking",
          auth: "whatsapp",
        }),
        req({
          name: "2. Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        req({
          name: "3. Continue — review draft",
          method: "GET",
          path: "user/order/{{draftOrderId}}/review",
          auth: "user",
        }),
        req({
          name: "4. Continue — complete if needed",
          method: "POST",
          path: "user/order/{{draftOrderId}}/complete-order",
          auth: "user",
          body: {
            service_type_id: 1,
            pickup_date: "2026-09-10",
            pickup_slot_id: 1,
            next_delivery_date: "2026-09-13",
          },
        }),
        req({
          name: "5. Confirm pay ₹0",
          method: "POST",
          path: "user/order/payment/{{draftOrderId}}/pay",
          auth: "user",
          body: {
            group_code: "{{groupCode}}",
            shift_id: 1,
            day_of_week: 3,
          },
        }),
        ...knowMore,
      ],
    ),
    folder(
      "Scenario 5 — Retention win-back (Push)",
      "VALUED10 + saved address",
      [
        req({
          name: "1. CRM winback",
          method: "GET",
          path: "whatsapp/crm/winback",
          auth: "whatsapp",
          query: [
            { key: "days", value: "30" },
            { key: "total_orders", value: "1" },
          ],
        }),
        req({
          name: "2. Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        req({
          name: "3. List addresses",
          method: "GET",
          path: "user/address",
          auth: "user",
        }),
        req({
          name: "4. Create draft",
          method: "POST",
          path: "user/order/",
          auth: "user",
          body: { service_id: 1, clothes_count: 15 },
          events: saveOrderEvents,
        }),
        req({
          name: "5. Complete + review",
          method: "POST",
          path: "user/order/{{orderId}}/complete-order",
          auth: "user",
          body: {
            service_type_id: 1,
            pickup_date: "2026-09-10",
            pickup_slot_id: 1,
            next_delivery_date: "2026-09-13",
          },
        }),
        req({
          name: "6. Apply VALUED10",
          method: "POST",
          path: "user/order/{{orderId}}/applyCoupon",
          auth: "user",
          body: { coupon_code: "VALUED10" },
        }),
        req({
          name: "7. Pay ₹0",
          method: "POST",
          path: "user/order/payment/{{orderId}}/pay",
          auth: "user",
          body: {
            group_code: "{{groupCode}}",
            shift_id: 1,
            day_of_week: 3,
          },
        }),
      ],
    ),
    folder(
      "Scenario 6 — Day of pickup",
      "Reminder + reschedule/cancel + rider (webhook + APIs)",
      [
        req({
          name: "Emit pickup_day_reminder (test)",
          method: "POST",
          path: "whatsapp/events/emit",
          auth: "whatsapp",
          body: { event: "pickup_day_reminder", order_id: "{{orderId}}" },
        }),
        req({
          name: "Order detail",
          method: "GET",
          path: "user/order/{{orderId}}/Orderdetail",
          auth: "user",
        }),
        req({
          name: "Reschedule pickup",
          method: "PUT",
          path: "user/order/{{orderId}}/rescheduleOrderPickup",
          auth: "user",
          body: {
            pickup_date: "2026-09-11",
            pickup_slot_id: 1,
          },
          description: "Confirm body fields against live API if needed",
        }),
        req({
          name: "Cancel booking",
          method: "POST",
          path: "user/order/{{orderId}}/cancelService",
          auth: "user",
          body: { reason_type: "pickup_schedule_issue" },
        }),
        req({
          name: "Rider info",
          method: "GET",
          path: "whatsapp/orders/{{orderId}}/rider",
          auth: "whatsapp",
        }),
        req({
          name: "Need help",
          method: "POST",
          path: "user/needHelp",
          auth: "user",
          body: {
            report_issue: "pickup_help",
            message: "Need help on pickup day",
          },
        }),
      ],
    ),
    folder("Scenario 7 — Pickup successful", "Webhook after rider OTP", [
      req({
        name: "Emit pickup_completed (test)",
        method: "POST",
        path: "whatsapp/events/emit",
        auth: "whatsapp",
        body: { event: "pickup_completed", order_id: "{{orderId}}" },
      }),
      req({
        name: "Order detail",
        method: "GET",
        path: "user/order/{{orderId}}/Orderdetail",
        auth: "user",
      }),
    ]),
    folder(
      "Scenario 8 — Weight + payment",
      "Finalize webhook → Razorpay remaining",
      [
        req({
          name: "Emit weight_confirmed (test)",
          method: "POST",
          path: "whatsapp/events/emit",
          auth: "whatsapp",
          body: { event: "order.weight_confirmed", order_id: "{{orderId}}" },
        }),
        req({
          name: "Order detail (bill)",
          method: "GET",
          path: "user/order/{{orderId}}/Orderdetail",
          auth: "user",
        }),
        req({
          name: "Create Razorpay order",
          method: "POST",
          path: "user/order/payment/{{orderId}}/create-order",
          auth: "user",
          body: { amount: 1185.04, payment_type: "remaining" },
        }),
        req({
          name: "Verify payment",
          method: "POST",
          path: "user/order/payment/{{orderId}}/verify",
          auth: "user",
          body: {
            razorpay_order_id: "order_xxx",
            razorpay_payment_id: "pay_xxx",
            razorpay_signature: "sig_xxx",
          },
        }),
      ],
    ),
    folder(
      "Scenario 9 — New / organic Hi",
      "Lookup + session + book / know more",
      [
        req({
          name: "Lookup",
          method: "POST",
          path: "whatsapp/customer/lookup",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
        }),
        req({
          name: "Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        ...bookChain.slice(0, 3),
        ...knowMore,
      ],
    ),
    folder(
      "Scenario 10 — Existing customer",
      "Personalised Hi + live status",
      [
        req({
          name: "Session",
          method: "POST",
          path: "whatsapp/session",
          auth: "whatsapp",
          body: { mobile: "{{mobile}}" },
          events: saveTokenEvents,
        }),
        req({
          name: "Active order",
          method: "GET",
          path: "whatsapp/orders/active-by-mobile",
          auth: "whatsapp",
          query: [{ key: "mobile", value: "{{mobile}}" }],
        }),
        req({
          name: "Order detail",
          method: "GET",
          path: "user/order/{{orderId}}/Orderdetail",
          auth: "user",
        }),
        req({
          name: "List addresses (book path)",
          method: "GET",
          path: "user/address",
          auth: "user",
        }),
        ...knowMore,
      ],
    ),
    folder("Scenario 11 — Delay inquiry", "Where is my pickup?", [
      req({
        name: "Session",
        method: "POST",
        path: "whatsapp/session",
        auth: "whatsapp",
        body: { mobile: "{{mobile}}" },
        events: saveTokenEvents,
      }),
      req({
        name: "Active order",
        method: "GET",
        path: "whatsapp/orders/active-by-mobile",
        auth: "whatsapp",
        query: [{ key: "mobile", value: "{{mobile}}" }],
      }),
      req({
        name: "Delay status",
        method: "GET",
        path: "whatsapp/orders/{{orderId}}/delay-status",
        auth: "whatsapp",
      }),
      req({
        name: "Rider",
        method: "GET",
        path: "whatsapp/orders/{{orderId}}/rider",
        auth: "whatsapp",
      }),
      req({
        name: "Need help / agent",
        method: "POST",
        path: "user/needHelp",
        auth: "user",
        body: {
          report_issue: "delay",
          message: "Pickup delayed",
        },
      }),
    ]),
  ],
};

writeFileSync(out, JSON.stringify(collection, null, 2));
console.log("Created:", out);
