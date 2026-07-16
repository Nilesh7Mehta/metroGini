/**
 * Dummy vendor payout seed data for Phase 1 UI.
 * Status is resolved at runtime from week_end vs today + in-memory paid overrides.
 */

const formatDate = (date) => date.toLocaleDateString('en-CA');

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Monday of the week containing `date` (local). */
const startOfWeekMonday = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
};

const buildWeek = (mondayDate, lengthDays = 8) => {
  const weekStart = new Date(mondayDate);
  weekStart.setHours(12, 0, 0, 0);
  // Inclusive end: Mon + 7 days = next Mon (1 Aug–8 Aug style), or Mon+6 = Sun.
  // Plan example uses 1 Aug–8 Aug (8 calendar days). Use Monday→next Monday inclusive.
  const weekEnd = addDays(weekStart, lengthDays - 1);
  return {
    week_start: formatDate(weekStart),
    week_end: formatDate(weekEnd),
  };
};

const formatDateLabel = (weekStart, weekEnd) => {
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  return `${start.toLocaleDateString('en-GB', opts)} - ${end.toLocaleDateString('en-GB', opts)}`;
};

/**
 * Builds relative dummy weeks so "current week" stays open for UI testing.
 * - currentWeek: Mon → Mon+7 (8 days), still running if today <= week_end
 * - lastWeek: previous window, closed → pending / paid
 * - olderWeek: closed + already paid in seed
 */
export const buildDummyPayoutSeed = (today = new Date()) => {
  const thisMonday = startOfWeekMonday(today);
  const current = buildWeek(thisMonday, 8);
  const last = buildWeek(addDays(thisMonday, -8), 8);
  const older = buildWeek(addDays(thisMonday, -16), 8);

  const batches = [
    {
      batch_id: 'vpb-101',
      vendor_id: 1,
      vendor_name: 'Sparkle Laundry',
      pincode_group_id: 1,
      zone_group: 'South Mumbai',
      pincode_group_name: 'South Mumbai',
      week_start: current.week_start,
      week_end: current.week_end,
      date_label: formatDateLabel(current.week_start, current.week_end),
      total_orders: 12,
      total_kg: 48.5,
      total_weight: 48.5,
      gross_revenue: 5200,
      gst_amount: 936,
      payable_amount: 6136,
      seed_paid: false,
    },
    {
      batch_id: 'vpb-102',
      vendor_id: 2,
      vendor_name: 'FreshFold Cleaners',
      pincode_group_id: 1,
      zone_group: 'South Mumbai',
      pincode_group_name: 'South Mumbai',
      week_start: current.week_start,
      week_end: current.week_end,
      date_label: formatDateLabel(current.week_start, current.week_end),
      total_orders: 8,
      total_kg: 31.2,
      total_weight: 31.2,
      gross_revenue: 3400,
      gst_amount: 612,
      payable_amount: 4012,
      seed_paid: false,
    },
    {
      batch_id: 'vpb-201',
      vendor_id: 1,
      vendor_name: 'Sparkle Laundry',
      pincode_group_id: 1,
      zone_group: 'South Mumbai',
      pincode_group_name: 'South Mumbai',
      week_start: last.week_start,
      week_end: last.week_end,
      date_label: formatDateLabel(last.week_start, last.week_end),
      total_orders: 15,
      total_kg: 62.0,
      total_weight: 62.0,
      gross_revenue: 6800,
      gst_amount: 1224,
      payable_amount: 8024,
      seed_paid: false,
    },
    {
      batch_id: 'vpb-202',
      vendor_id: 3,
      vendor_name: 'Metro Wash Hub',
      pincode_group_id: 4,
      zone_group: 'Thane C',
      pincode_group_name: 'Thane C',
      week_start: last.week_start,
      week_end: last.week_end,
      date_label: formatDateLabel(last.week_start, last.week_end),
      total_orders: 10,
      total_kg: 40.0,
      total_weight: 40.0,
      gross_revenue: 4500,
      gst_amount: 810,
      payable_amount: 5310,
      seed_paid: false,
    },
    {
      batch_id: 'vpb-301',
      vendor_id: 1,
      vendor_name: 'Sparkle Laundry',
      pincode_group_id: 1,
      zone_group: 'South Mumbai',
      pincode_group_name: 'South Mumbai',
      week_start: older.week_start,
      week_end: older.week_end,
      date_label: formatDateLabel(older.week_start, older.week_end),
      total_orders: 18,
      total_kg: 71.5,
      total_weight: 71.5,
      gross_revenue: 7200,
      gst_amount: 1296,
      payable_amount: 8496,
      seed_paid: true,
      transaction_id: 'TXN-DUMMY-9001',
      invoice_id: 'INV-DUMMY-9001',
      invoice_image: '/uploads/vendor-payout-invoices/dummy-sparkle-older.pdf',
      payment_date: older.week_end,
      paid_at: `${older.week_end}T18:30:00+05:30`,
    },
    {
      batch_id: 'vpb-302',
      vendor_id: 2,
      vendor_name: 'FreshFold Cleaners',
      pincode_group_id: 1,
      zone_group: 'South Mumbai',
      pincode_group_name: 'South Mumbai',
      week_start: older.week_start,
      week_end: older.week_end,
      date_label: formatDateLabel(older.week_start, older.week_end),
      total_orders: 9,
      total_kg: 28.0,
      total_weight: 28.0,
      gross_revenue: 3100,
      gst_amount: 558,
      payable_amount: 3658,
      seed_paid: true,
      transaction_id: 'TXN-DUMMY-9002',
      invoice_id: 'INV-DUMMY-9002',
      invoice_image: '/uploads/vendor-payout-invoices/dummy-freshfold-older.pdf',
      payment_date: older.week_end,
      paid_at: `${older.week_end}T19:00:00+05:30`,
    },
  ];

  // Dummy order lines for Master → View Orders
  const orders = [
    // Sparkle Laundry (vendor 1) — across weeks
    {
      id: 'ord-1001',
      order_id: 'ORD-1001',
      vendor_id: 1,
      pincode_group_id: 1,
      date: last.week_start,
      week_start: last.week_start,
      week_end: last.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 8.5,
      order_amount: 850,
      vendor_revenue: 765,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'pending',
    },
    {
      id: 'ord-1002',
      order_id: 'ORD-1002',
      vendor_id: 1,
      pincode_group_id: 1,
      date: addDays(new Date(`${last.week_start}T12:00:00`), 2).toLocaleDateString('en-CA'),
      week_start: last.week_start,
      week_end: last.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 12.0,
      order_amount: 1200,
      vendor_revenue: 1080,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'pending',
    },
    {
      id: 'ord-1003',
      order_id: 'ORD-1003',
      vendor_id: 1,
      pincode_group_id: 1,
      date: current.week_start,
      week_start: current.week_start,
      week_end: current.week_end,
      service_type: 'Dry Clean',
      weight_kg: 6.0,
      order_amount: 900,
      vendor_revenue: 540,
      vendor_amount_per_kg: 90,
      status: 'ready_for_delivery',
      payout_status: 'invoice_not_generated',
    },
    {
      id: 'ord-1004',
      order_id: 'ORD-1004',
      vendor_id: 1,
      pincode_group_id: 1,
      date: older.week_start,
      week_start: older.week_start,
      week_end: older.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 10.0,
      order_amount: 1000,
      vendor_revenue: 900,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'paid',
    },
    // FreshFold (vendor 2)
    {
      id: 'ord-2001',
      order_id: 'ORD-2001',
      vendor_id: 2,
      pincode_group_id: 1,
      date: current.week_start,
      week_start: current.week_start,
      week_end: current.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 7.5,
      order_amount: 750,
      vendor_revenue: 675,
      vendor_amount_per_kg: 90,
      status: 'out_for_delivery',
      payout_status: 'invoice_not_generated',
    },
    {
      id: 'ord-2002',
      order_id: 'ORD-2002',
      vendor_id: 2,
      pincode_group_id: 1,
      date: older.week_start,
      week_start: older.week_start,
      week_end: older.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 9.0,
      order_amount: 900,
      vendor_revenue: 810,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'paid',
    },
    // Metro Wash Hub (vendor 3)
    {
      id: 'ord-3001',
      order_id: 'ORD-3001',
      vendor_id: 3,
      pincode_group_id: 4,
      date: last.week_start,
      week_start: last.week_start,
      week_end: last.week_end,
      service_type: 'Wash By Kilo',
      weight_kg: 11.0,
      order_amount: 1100,
      vendor_revenue: 990,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'pending',
    },
    {
      id: 'ord-3002',
      order_id: 'ORD-3002',
      vendor_id: 3,
      pincode_group_id: 4,
      date: addDays(new Date(`${last.week_start}T12:00:00`), 3).toLocaleDateString('en-CA'),
      week_start: last.week_start,
      week_end: last.week_end,
      service_type: 'Dry Clean',
      weight_kg: 5.5,
      order_amount: 1100,
      vendor_revenue: 495,
      vendor_amount_per_kg: 90,
      status: 'delivered',
      payout_status: 'pending',
    },
  ];

  return { batches, orders, weeks: { current, last, older } };
};
