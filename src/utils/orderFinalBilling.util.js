import { applyCouponDiscount, applyGst } from './price.util.js';

/**
 * Rebuild final payable after weight is confirmed.
 * After confirmWeight, orders.extra_price_per_kg stores the flat extra-weight CHARGE
 * (not the per-kg rate).
 */
export const computeFinalTotalsFromOrder = (order) => {
  const estimatedTotal = Number(order.estimated_total || 0);
  const extraWeightCharge = Number(order.extra_price_per_kg || 0);
  const grossBaseTotal = parseFloat(
    (estimatedTotal + extraWeightCharge).toFixed(2),
  );

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

  const vendorRequestAmount =
    Number(order.is_stained) === 1 && order.vendor_request_amount != null
      ? Number(order.vendor_request_amount)
      : 0;
  const vendorRequestMarkup =
    Number(order.is_stained) === 1 && order.vendor_request_markup != null
      ? Number(order.vendor_request_markup)
      : 0;

  const subtotalBeforeGst = parseFloat(
    (baseTotal + vendorRequestAmount + vendorRequestMarkup).toFixed(2),
  );
  const { gst, final_total } = applyGst(subtotalBeforeGst);
  const amountPaid = Number(order.amount_paid || 0);
  const remaining_amount = parseFloat((final_total - amountPaid).toFixed(2));

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
 * Same math as confirmWeight for a given actual weight + extra charge
 * (before persisting extra_price_per_kg overwrite).
 */
export const computeFinalTotalsForConfirmWeight = ({
  order,
  actualWeight,
  extraWeightCharge,
  vendorRequestAmount = 0,
  vendorRequestMarkup = 0,
}) => {
  const estimatedTotal = Number(order.estimated_total || 0);
  const grossBaseTotal = parseFloat(
    (estimatedTotal + Number(extraWeightCharge || 0)).toFixed(2),
  );

  const hasCoupon = Boolean(order.applied_coupon_id);
  const couponOrder = hasCoupon
    ? {
        applied_coupon_id: order.applied_coupon_id,
        discount_type: order.discount_type,
        discount_value: order.discount_value,
        minimum_amount_value: order.minimum_amount_value,
        maximum_amount_value: order.maximum_amount_value,
        actual_weight: actualWeight,
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
