import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = "https://api.metrogini.com";

const columns = ["Name", "Endpoint", "Request", "Response", "Token Required"];

const flow1 = [
  {
    Name: "login-or-register",
    Endpoint: `POST ${base}/api/user/login-or-register`,
    Request: JSON.stringify({ mobile: "9004186460" }),
    Response: JSON.stringify({
      success: true,
      message: "OTP sent",
    }),
    "Token Required": "No",
  },
  {
    Name: "verify-otp",
    Endpoint: `POST ${base}/api/user/verify-otp`,
    Request: JSON.stringify({ mobile: "9004186460", otp: "1234" }),
    Response: JSON.stringify({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: "<jwt>",
        refresh_token: "<token>",
        expires_in: "15m",
        profile_completed: true,
        terms_and_condition: true,
      },
    }),
    "Token Required": "No",
  },
  {
    Name: "services (pricing)",
    Endpoint: `GET ${base}/api/common/services?pincode=400602`,
    Request: "—",
    Response: JSON.stringify({
      success: true,
      data: { services: [], pincode_group_id: 1 },
    }),
    "Token Required": "No",
  },
  {
    Name: "add-address",
    Endpoint: `POST ${base}/api/user/address`,
    Request: JSON.stringify({
      address_type: "home",
      complete_address: "A-204, Lotus Residency, Andheri West",
      floor: "204",
      landmark: "Near station",
      receiver_name: "Karthik",
      contact_number: "9004186460",
      latitude: "19.1234",
      longitude: "72.5678",
      pincode: "400058",
    }),
    Response: JSON.stringify({
      success: true,
      message: "Address added successfully",
      data: { id: 1 },
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "set-default-address",
    Endpoint: `PUT ${base}/api/user/address/default/:id`,
    Request: "— (path param: address id)",
    Response: JSON.stringify({
      success: true,
      message: "Default address updated",
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "slots-availability",
    Endpoint: `GET ${base}/api/common/slots/availability?pincodeGroupId=1&days=7`,
    Request: "—",
    Response: JSON.stringify({
      pincodeGroupId: 1,
      days: 7,
      availability: [
        {
          date: "2026-09-02",
          day: "Tuesday",
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
    }),
    "Token Required": "No",
  },
  {
    Name: "create-order",
    Endpoint: `POST ${base}/api/user/order/`,
    Request: JSON.stringify({ service_id: 1, clothes_count: 15 }),
    Response: JSON.stringify({
      message: "Order created successfully",
      id: 24571,
      order_id: "MG24571",
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "complete-order",
    Endpoint: `POST ${base}/api/user/order/:id/complete-order`,
    Request: JSON.stringify({
      service_type_id: 1,
      pickup_date: "2026-09-02",
      pickup_slot_id: 1,
      next_delivery_date: "2026-09-06",
    }),
    Response: JSON.stringify({
      message: "Order completed successfully",
      order_id: "24571",
      delivery_date: "2026-09-06",
      estimated_total: "850.00",
      booked_at: "2026-08-31T10:00:00.000Z",
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "finalize-order",
    Endpoint: `POST ${base}/api/user/order/:id/finalize`,
    Request: "—",
    Response: JSON.stringify({
      message: "Order finalized successfully",
      order_id: "24571",
      estimated_total: "850.00",
      booked_at: "2026-08-31T10:00:00.000Z",
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "assign-vendor-rider (pay ₹0)",
    Endpoint: `POST ${base}/api/user/order/payment/:id/pay`,
    Request: JSON.stringify({
      group_code: "MUM_WEST",
      shift_id: 1,
      day_of_week: 2,
    }),
    Response: JSON.stringify({
      message: "Payment successful. Order booked.",
      order_id: 24571,
      assigned_vendor: 12,
      assigned_rider: 5,
      advance_paid: 0,
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "order-detail",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request: "—",
    Response: JSON.stringify({
      success: true,
      data: {
        id: 24571,
        order_code: "MG24571",
        status: "booked",
        payment_status: "partially_paid",
        estimated_total: 850,
        final_total: null,
        remaining_amount: null,
        amount_paid: 0,
      },
    }),
    "Token Required": "User Bearer",
  },
];

const flow2 = [
  {
    Name: "confirm-clothes",
    Endpoint: `POST ${base}/api/vendor/order/:order_id/confirm-clothes`,
    Request: JSON.stringify({ actual_clothes: 15 }),
    Response: JSON.stringify({
      success: true,
      data: { order_id: 24571, actual_clothes: 15 },
    }),
    "Token Required": "Vendor Bearer",
  },
  {
    Name: "confirm-weight",
    Endpoint: `POST ${base}/api/vendor/order/:order_id/confirm-weight`,
    Request:
      "form-data: actual_weight=6.8, is_stained=0 (or is_stained=1 + vendor_request_amount + stain images)",
    Response: JSON.stringify({
      success: true,
      data: {
        order_id: 24571,
        actual_weight: 6.8,
        final_total: 1185.04,
        remaining_amount: 1185.04,
      },
    }),
    "Token Required": "Vendor Bearer",
  },
  {
    Name: "finalize-order (vendor)",
    Endpoint: `POST ${base}/api/vendor/order/:order_id/finalize`,
    Request: "—",
    Response: JSON.stringify({
      success: true,
      data: { order_id: 24571, status: "order_finalized" },
    }),
    "Token Required": "Vendor Bearer",
  },
  {
    Name: "order-detail (read bill)",
    Endpoint: `GET ${base}/api/user/order/:id/Orderdetail`,
    Request: "—",
    Response: JSON.stringify({
      success: true,
      data: {
        actual_weight: 6.8,
        final_total: 1185.04,
        remaining_amount: 1185.04,
        amount_paid: 0,
        payment_status: "partially_paid",
      },
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "create-razorpay-order",
    Endpoint: `POST ${base}/api/user/order/payment/:id/create-order`,
    Request: JSON.stringify({ amount: 1185.04, payment_type: "remaining" }),
    Response: JSON.stringify({
      key_id: "rzp_test_xxx",
      order_id: "order_xxx",
      amount: 118504,
      currency: "INR",
      payment_type: "remaining",
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "verify-payment",
    Endpoint: `POST ${base}/api/user/order/payment/:id/verify`,
    Request: JSON.stringify({
      razorpay_order_id: "order_xxx",
      razorpay_payment_id: "pay_xxx",
      razorpay_signature: "signature_xxx",
    }),
    Response: JSON.stringify({
      message: "Payment verified successfully",
      verified: true,
    }),
    "Token Required": "User Bearer",
  },
  {
    Name: "razorpay-webhook",
    Endpoint: `POST ${base}/api/user/order/payment/razorpay/webhook`,
    Request: "Razorpay payment.captured event payload",
    Response: JSON.stringify({ success: true }),
    "Token Required": "Razorpay webhook signature (no user token)",
  },
];

function sheetFromRows(rows) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
  ws["!cols"] = [
    { wch: 28 },
    { wch: 55 },
    { wch: 50 },
    { wch: 55 },
    { wch: 28 },
  ];
  return ws;
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheetFromRows(flow1), "User Create Order Flow");
XLSX.utils.book_append_sheet(wb, sheetFromRows(flow2), "Weight and Payment Flow");

const outPath = join(__dirname, "..", "gallabox_api_flows.xlsx");
XLSX.writeFile(wb, outPath);
console.log(`Created: ${outPath}`);
