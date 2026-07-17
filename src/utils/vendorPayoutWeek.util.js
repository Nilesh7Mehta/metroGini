/** Vendor payout week helpers — matches Phase 1 dummy (Mon → next Mon, 8 days). */

export const PAYOUT_WEEK_LENGTH_DAYS = 8;
export const PAYOUT_GST_RATE = 0.18;

export const ELIGIBLE_PAYOUT_STATUSES = [
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
];

const formatDate = (date) =>
  date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Monday of the week containing `date` (IST wall-clock). */
export const startOfWeekMonday = (date = new Date()) => {
  const d = new Date(
    typeof date === 'string' || date instanceof Date
      ? date
      : Date.now(),
  );
  // Normalize via IST calendar parts
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const day = Number(get('day'));
  const weekday = get('weekday'); // Mon, Tue, ...

  const localNoon = new Date(Date.UTC(y, m - 1, day, 6, 30, 0)); // approx IST noon as UTC
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const diff = map[weekday] ?? 0;
  localNoon.setUTCDate(localNoon.getUTCDate() - diff);
  return localNoon;
};

export const buildWeek = (mondayDate, lengthDays = PAYOUT_WEEK_LENGTH_DAYS) => {
  const weekStart = new Date(mondayDate);
  const weekEnd = addDays(weekStart, lengthDays - 1);
  return {
    week_start: formatDate(weekStart),
    week_end: formatDate(weekEnd),
  };
};

export const weekForDate = (dateInput) => {
  const monday = startOfWeekMonday(dateInput);
  return buildWeek(monday, PAYOUT_WEEK_LENGTH_DAYS);
};

export const formatDateLabel = (weekStart, weekEnd) => {
  const opts = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' };
  const start = new Date(`${weekStart}T12:00:00+05:30`);
  const end = new Date(`${weekEnd}T12:00:00+05:30`);
  return `${start.toLocaleDateString('en-GB', opts)} - ${end.toLocaleDateString('en-GB', opts)}`;
};

export const todayStr = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const calcGstPayable = (grossRevenue) => {
  const gross = Number(grossRevenue) || 0;
  const gst_amount = Math.round(gross * PAYOUT_GST_RATE);
  return {
    gross_revenue: Math.round(gross * 100) / 100,
    gst_amount,
    payable_amount: Math.round((gross + gst_amount) * 100) / 100,
  };
};

export const resolveOpenPaymentStatus = (weekEnd, today = todayStr()) => {
  if (today <= weekEnd) return 'invoice_not_generated';
  return 'pending';
};

export const toDateStr = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};
