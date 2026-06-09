import { APP_TIMEZONE } from '../config/db.js';

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

const IST_OFFSET = '+05:30';

const formatDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
};

const parseToDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Naive PG timestamp string — treat as IST wall-clock, not UTC.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const normalized = raw.replace(' ', 'T').split('.')[0];
    const date = new Date(`${normalized}${IST_OFFSET}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** @returns {string|null} Formatted as yyyy/mm/dd hh:mm:ss in APP_TIMEZONE, or null if missing/invalid */
export const formatDateTime = (value) => {
  if (value == null || value === '') return null;
  const date = parseToDate(value);
  if (!date) return null;
  return formatDateParts(date);
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
