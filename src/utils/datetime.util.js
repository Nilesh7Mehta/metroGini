const LIFECYCLE_TIMESTAMP_KEYS = [
  'booked_at',
  'out_for_pickup_at',
  'pickup_started_at',
  'pickup_completed_at',
  'vendor_received_at',
  'order_finalized_at',
  'ready_for_delivery_at',
  'out_for_delivery_at',
  'delivery_completed_at',
  'cancelled_at',
  'payment_completed_at',
];

/** @returns {string|null} Formatted as yyyy/mm/dd hh:mm:ss, or null if missing/invalid */
export const formatDateTime = (value) => {
  if (value == null || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** @returns {Record<string, string|null>} All lifecycle timestamps formatted; null when not set */
export const buildOrderTimestamps = (order) => {
  const timestamps = {};

  for (const key of LIFECYCLE_TIMESTAMP_KEYS) {
    timestamps[key] = formatDateTime(order[key]);
  }

  timestamps.created_at = formatDateTime(order.created_at);
  timestamps.updated_at = formatDateTime(order.updated_at);
  timestamps.otp_generated_at = formatDateTime(order.otp_generated_at);

  return timestamps;
};

export const ORDER_TIMESTAMP_COLUMNS = [
  ...LIFECYCLE_TIMESTAMP_KEYS,
  'created_at',
  'updated_at',
  'otp_generated_at',
].join(', ');

/** Load and format all order timestamps after a status transition */
export const fetchOrderTimestamps = async (db, orderId) => {
  const { rows } = await db.query(
    `SELECT ${ORDER_TIMESTAMP_COLUMNS} FROM orders WHERE id = $1`,
    [orderId],
  );
  return buildOrderTimestamps(rows[0] || {});
};
