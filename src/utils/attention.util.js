import { resolveOpsIssueType } from './opsIssue.util.js';

const PRE_PICKUP_STATUSES = [
  'booked',
  'confirmed',
  'out_for_pickup',
  'pickup_in_progress',
];

const ATTENTION_CATALOG = {
  vendor_not_started: 'Vendor — not started',
  vendor_partial: 'Vendor — partly confirmed',
  vendor_not_ready: 'Vendor — confirmed, not ready',
  rider_failed_pickup: 'Rider — failed pickup',
  rider_missed_pickup: 'Rider — missed pickup',
  rider_not_handed_over: 'Rider — picked up, not handed over',
  rider_not_collected: 'Rider — not collected from vendor',
  rider_out_not_delivered: 'Rider — out, not delivered',
  rider_failed_delivery: 'Rider — failed delivery',
  rider_missed_delivery: 'Rider — missed delivery',
};

const toDateStr = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toLocaleDateString('en-CA');
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
};

const todayStr = () => new Date().toLocaleDateString('en-CA');

const reason = (party, code) => ({
  party,
  code,
  label: ATTENTION_CATALOG[code],
});

const weightConfirmed = (order) => {
  if (order.actual_weight == null || String(order.actual_weight).trim() === '') {
    return false;
  }
  return Number(order.actual_weight) > 0;
};

const clothesConfirmed = (order) => Number(order.actual_clothes_count) > 0;

/**
 * One reason per order for the selected day.
 * Cancelled, draft, and delivered orders are ignored.
 * Vendor reasons apply only while the order is still with the vendor.
 * Rider reasons apply to pickup and delivery problems.
 */
export const classifyAttention = (order, selectedDate, asOfDate = todayStr()) => {
  const status = String(order.status || '');
  if (!status || status === 'draft' || status === 'cancelled' || status === 'delivered') {
    return null;
  }

  const pickupOnDay = toDateStr(order.pickup_date) === selectedDate;
  const deliveryOnDay = toDateStr(order.delivery_date) === selectedDate;
  if (!pickupOnDay && !deliveryOnDay) return null;

  const dayPassed = selectedDate < asOfDate;
  const ops = resolveOpsIssueType(order, asOfDate);
  const handedToVendor = Boolean(order.vendor_received_at)
    || ['in_process', 'order_finalized', 'ready_for_delivery', 'out_for_delivery'].includes(status);

  if (pickupOnDay && ops === 'failed_pickup') {
    return reason('rider', 'rider_failed_pickup');
  }

  if ((pickupOnDay || deliveryOnDay) && status === 'picked_up' && !handedToVendor) {
    return reason('rider', 'rider_not_handed_over');
  }

  if (pickupOnDay && dayPassed && PRE_PICKUP_STATUSES.includes(status)) {
    return reason('rider', 'rider_missed_pickup');
  }

  if (deliveryOnDay && (status === 'in_process' || status === 'order_finalized')) {
    const dryClean = Number(order.service_id) === 2;
    const weight = weightConfirmed(order);
    const clothes = clothesConfirmed(order);
    const fullyConfirmed = dryClean ? clothes : weight && clothes;

    if (status === 'order_finalized' || fullyConfirmed) {
      return reason('vendor', 'vendor_not_ready');
    }
    if (!dryClean && (weight || clothes)) {
      return reason('vendor', 'vendor_partial');
    }
    return reason('vendor', 'vendor_not_started');
  }

  if (deliveryOnDay && (ops === 'failed_drop' || ops === 'missed_drop')) {
    return reason(
      'rider',
      ops === 'missed_drop' ? 'rider_missed_delivery' : 'rider_failed_delivery',
    );
  }

  if (deliveryOnDay && status === 'ready_for_delivery') {
    return dayPassed
      ? reason('rider', 'rider_missed_delivery')
      : reason('rider', 'rider_not_collected');
  }

  if (deliveryOnDay && status === 'out_for_delivery') {
    return dayPassed
      ? reason('rider', 'rider_missed_delivery')
      : reason('rider', 'rider_out_not_delivered');
  }

  return null;
};

export const collectAttention = (orders, selectedDate, party = null) => {
  const reasons = [];
  const seen = new Set();
  let count = 0;

  for (const order of orders) {
    const item = classifyAttention(order, selectedDate);
    if (!item) continue;
    if (party && item.party !== party) continue;
    count += 1;
    if (!seen.has(item.code)) {
      seen.add(item.code);
      reasons.push(item);
    }
  }

  return { count, reasons };
};
