/**
 * User-facing FCM / in-app notification templates.
 * Placeholders match the WhatsApp-style copy provided by product.
 */
import sql from '../config/db.js';

// Deep links — only used when env vars are set (commented out for now)
const APP_LINK =
  process.env.USER_APP_LINK ||
  process.env.APP_LINK ||
  null;

const RATING_LINK = process.env.RATING_LINK || null;

const paymentLinkForOrder = (orderId) => {
  if (!process.env.PAYMENT_LINK_TEMPLATE) return null;
  return String(process.env.PAYMENT_LINK_TEMPLATE).replace(
    '{{order_id}}',
    String(orderId),
  );
};

const withOptionalLink = (text, link, label) =>
  link ? `${text} ${label} ${link}` : text;

const displayName = (name) => {
  const n = String(name || '').trim();
  return n || 'there';
};

/** Display order.id as ORD-003 (never order_code). */
export const formatOrderDisplayId = (orderId) => {
  if (orderId == null || orderId === '') return '';
  const n = Number(orderId);
  if (!Number.isInteger(n) || n <= 0) return '';
  return `ORD-${String(n).padStart(3, '0')}`;
};

const orderRef = (_orderCode, orderId) => formatOrderDisplayId(orderId);

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const formatWeight = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const formatSlotLabel = (row) => {
  if (!row) return null;
  if (row.shift_name) return String(row.shift_name).trim();
  if (row.start_time && row.end_time) {
    const start = String(row.start_time).slice(0, 5);
    const end = String(row.end_time).slice(0, 5);
    return `${start}-${end}`;
  }
  return null;
};

/** Load common order + user fields for templates */
export const fetchOrderNotifyContext = async (orderId) => {
  const { rows } = await sql.query(
    `
    SELECT
      o.id,
      o.order_code,
      o.user_id,
      o.actual_weight,
      o.final_total,
      o.amount_paid,
      o.remaining_amount,
      TO_CHAR(o.pickup_date, 'YYYY-MM-DD') AS pickup_date,
      u.full_name,
      ts.shift_name,
      ts.start_time,
      ts.end_time
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN time_slots ts ON ts.id = o.pickup_slot_id
    WHERE o.id = $1
    `,
    [orderId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    orderId: row.id,
    orderCode: row.order_code,
    userId: row.user_id,
    name: row.full_name,
    pickupDate: row.pickup_date,
    pickupSlot: formatSlotLabel(row),
    weightKg: row.actual_weight,
    totalAmount: row.final_total,
    amountPaid: row.amount_paid,
    remainingAmount: row.remaining_amount,
  };
};

/** 1) Account created */
export const accountCreatedTemplate = ({ name } = {}) => ({
  title: 'Welcome to Metrogini!',
  message: withOptionalLink(
    `Hi ${displayName(name)}, your account has been successfully created. ` +
      `Say goodbye to laundry days and hello to fresh, clean clothes. ` +
      `Book your very first pickup in the Metrogini App!`,
    APP_LINK,
    'Book First Pickup 👉',
  ),
  data: {
    type: 'account_created',
    ...(APP_LINK ? { app_link: APP_LINK } : {}),
  },
});

/**
 * 2) Order confirmed (no advance payment wording)
 * {{1}} name, {{2}} order ref, {{3}} pickup date, {{4}} slot
 */
export const orderConfirmedTemplate = ({
  name,
  orderCode,
  orderId,
  pickupDate,
  pickupSlot,
} = {}) => ({
  title: 'Order Confirmed! ✅',
  message:
    `Thank you, ${displayName(name)}! Your Order ${orderRef(orderCode, orderId)} is confirmed. ` +
    `Our rider will arrive for pickup on ${pickupDate || 'your scheduled date'}` +
    (pickupSlot ? ` during the ${pickupSlot} time slot` : '') +
    `. Please keep your clothes ready!`,
  data: {
    type: 'order_confirmed',
    order_id: orderId != null ? String(orderId) : '',
    ...(APP_LINK ? { app_link: APP_LINK } : {}),
  },
});

/**
 * 3) Weight & invoice (no advance — remaining = unpaid balance)
 * {{1}} order, {{2}} weight, {{3}} total, {{4}} remaining
 */
export const weightInvoiceTemplate = ({
  orderCode,
  orderId,
  weightKg: weight,
  totalAmount,
  remainingAmount,
} = {}) => {
  const payLink = paymentLinkForOrder(orderId);
  const remaining =
    remainingAmount != null && remainingAmount !== ''
      ? remainingAmount
      : totalAmount;

  const baseMessage =
    `Your laundry for Order ${orderRef(orderCode, orderId)} has been successfully sorted and weighed.\n` +
    `Invoice Summary:\n` +
    `• Total Weight: ${formatWeight(weight)} kg\n` +
    `• Total Amount: Rs. ${money(totalAmount)}\n` +
    `• Remaining Balance: Rs. ${money(remaining)}\n` +
    `Please settle the balance so we can initiate the washing cycle without delays!`;

  return {
    title: 'Weight & Invoice Details ⚖️',
    message: withOptionalLink(baseMessage, payLink, '\nPay Balance Now 💳'),
    data: {
      type: 'weight_invoice',
      order_id: orderId != null ? String(orderId) : '',
      ...(payLink ? { payment_link: payLink } : {}),
      ...(APP_LINK ? { app_link: APP_LINK } : {}),
    },
  };
};

/** 4) Account / login OTP */
export const accountOtpTemplate = ({ otp } = {}) => ({
  title: 'Metrogini OTP',
  message:
    `Your OTP for creating your Metrogini account is ${otp}. ` +
    `Valid for 10 minutes. Do not share this code with anyone.`,
  data: {
    type: 'account_otp',
  },
});

/** 5) Order received (short) */
export const orderReceivedTemplate = ({ orderId } = {}) => ({
  title: "We've received your order!",
  message:
    'Track your order status on the Metrogini App or check your WhatsApp for further updates.',
  data: {
    type: 'order_received',
    order_id: orderId != null ? String(orderId) : '',
    ...(APP_LINK ? { app_link: APP_LINK } : {}),
  },
});

/** 6) Pickup OTP when rider arrives */
export const pickupOtpTemplate = ({ otp } = {}) => ({
  title: 'Rider arrived for pickup',
  message:
    `Our rider has arrived for your laundry pickup! ` +
    `Please share OTP ${otp} with the rider to verify your pickup.`,
  data: {
    type: 'pickup_otp',
  },
});

/** 7) Delivery OTP at doorstep */
export const deliveryOtpTemplate = ({ otp } = {}) => ({
  title: 'Laundry at your doorstep!',
  message:
    `Your fresh laundry is at your doorstep! ` +
    `Please share OTP ${otp} with the rider to confirm delivery.`,
  data: {
    type: 'delivery_otp',
  },
});

/** 8) Rating / feedback after delivery */
export const ratingRequestTemplate = ({ orderId } = {}) => ({
  title: 'Thank you for choosing Metrogini! ✨',
  message: withOptionalLink(
    `We'd love your feedback. Please take a moment to rate us in the Metrogini App.`,
    RATING_LINK,
    'Rate us here:',
  ),
  data: {
    type: 'rating_request',
    order_id: orderId != null ? String(orderId) : '',
    ...(RATING_LINK ? { rating_link: RATING_LINK } : {}),
    ...(APP_LINK ? { app_link: APP_LINK } : {}),
  },
});

export const USER_NOTIFICATION_LINKS = {
  APP_LINK,
  RATING_LINK,
  paymentLinkForOrder,
};
