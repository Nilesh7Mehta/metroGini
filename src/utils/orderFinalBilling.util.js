import { applyCouponDiscount, applyGst } from './price.util.js';

/** User bill after vendor confirms weight: actual kg × zone rate per kg. */
const resolveGrossBaseTotal = (order, actualWeight) => {
  const weight = Number(
    actualWeight != null && actualWeight !== ''
      ? actualWeight
      : order.actual_weight,
  );
  const rate = Number(order.base_price_per_kg || 0);

  if (Number.isFinite(weight) && weight > 0 && Number.isFinite(rate) && rate >= 0) {
    return parseFloat((weight * rate).toFixed(2));
  }

  return parseFloat(Number(order.estimated_total || 0).toFixed(2));
};

const applyStainAndGst = (order, grossBaseTotal, vendorRequestAmount, vendorRequestMarkup) => {
  const hasCoupon = Boolean(order.applied_coupon_id || order.coupon_id);
  const couponOrder = hasCoupon
    ? {
        applied_coupon_id: order.applied_coupon_id || order.coupon_id,
        coupon_id: order.coupon_id || order.applied_coupon_id,
        discount_type: order.discount_type,
        discount_value: order.discount_value,
        minimum_amount_value: order.minimum_amount_value,
        maximum_amount_value: order.maximum_amount_value,
        actual_weight: order.actual_weight,
        estimated_weight_min: order.estimated_weight_min,
        estimated_weight_max: order.estimated_weight_max,
      }
    : {};

  const { discount, net_total: baseTotal } = applyCouponDiscount(
    grossBaseTotal,
    couponOrder,
  );

  const subtotalBeforeGst = parseFloat(
    (
      baseTotal +
      Number(vendorRequestAmount || 0) +
      Number(vendorRequestMarkup || 0)
    ).toFixed(2),
  );
  const { gst, final_total } = applyGst(subtotalBeforeGst);
  const remaining_amount = parseFloat(
    (final_total - Number(order.amount_paid || 0)).toFixed(2),
  );

  return {
    gross_base_total: grossBaseTotal,
    discount: parseFloat(Number(discount).toFixed(2)),
    base_total: baseTotal,
    subtotal_before_gst: subtotalBeforeGst,
    gst,
    final_total,
    remaining_amount,
  };
};

/**
 * Rebuild final payable after weight is confirmed.
 * User total = actual_weight × base_price_per_kg (zone rate), then coupon, stain, GST.
 */
export const computeFinalTotalsFromOrder = (order) => {
  const grossBaseTotal = resolveGrossBaseTotal(order, order.actual_weight);

  const vendorRequestAmount =
    Number(order.is_stained) === 1 && order.vendor_request_amount != null
      ? Number(order.vendor_request_amount)
      : 0;
  const vendorRequestMarkup =
    Number(order.is_stained) === 1 && order.vendor_request_markup != null
      ? Number(order.vendor_request_markup)
      : 0;

  return applyStainAndGst(
    order,
    grossBaseTotal,
    vendorRequestAmount,
    vendorRequestMarkup,
  );
};

/**
 * Same math as confirmWeight for a given actual weight.
 */
export const computeFinalTotalsForConfirmWeight = ({
  order,
  actualWeight,
  extraWeightCharge,
  vendorRequestAmount = 0,
  vendorRequestMarkup = 0,
}) => {
  void extraWeightCharge;
  const grossBaseTotal = resolveGrossBaseTotal(order, actualWeight);
  return applyStainAndGst(
    { ...order, actual_weight: actualWeight },
    grossBaseTotal,
    vendorRequestAmount,
    vendorRequestMarkup,
  );
};
