const OPS_ISSUE_TYPES = [
  'failed_pickup',
  'failed_drop',
  'missed_pickup',
  'missed_drop',
];

const toDateStr = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toLocaleDateString('en-CA');
  const raw = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
};

const todayStr = () => new Date().toLocaleDateString('en-CA');

/**
 * Classify pickup/drop operational issues for admin dashboard/orders.
 * Explicit open report types win; otherwise infer from schedule + lifecycle.
 */
export const resolveOpsIssueType = (order, asOfDate = todayStr()) => {
  const reportType = order.open_issue_type || order.issue_type || null;
  if (OPS_ISSUE_TYPES.includes(reportType)) return reportType;
  if (reportType === 'pickup_failure') return 'failed_pickup';

  const status = String(order.status || '');
  const pickupDate = toDateStr(order.pickup_date);
  const deliveryDate = toDateStr(order.delivery_date);
  const cancelReason = String(
    order.cancel_reason_type || order.reason_type || '',
  ).toLowerCase();

  if (status === 'cancelled') {
    if (
      order.out_for_delivery_at ||
      /drop|delivery/.test(cancelReason)
    ) {
      return 'failed_drop';
    }
    if (
      order.out_for_pickup_at ||
      order.pickup_started_at ||
      /pickup|otp|rider/.test(cancelReason)
    ) {
      return 'failed_pickup';
    }
  }

  // Scheduled pickup day passed, still waiting for collection
  if (
    pickupDate &&
    pickupDate < asOfDate &&
    ['booked', 'out_for_pickup', 'pickup_in_progress'].includes(status)
  ) {
    return 'missed_pickup';
  }

  // Scheduled delivery day passed, still in post-pickup pipeline
  if (
    deliveryDate &&
    deliveryDate < asOfDate &&
    ![
      'draft',
      'cancelled',
      'delivered',
      'booked',
      'out_for_pickup',
      'pickup_in_progress',
    ].includes(status)
  ) {
    return 'missed_drop';
  }

  return null;
};

export const isValidOpsIssueType = (value) =>
  OPS_ISSUE_TYPES.includes(String(value || '').toLowerCase());

export { OPS_ISSUE_TYPES };
