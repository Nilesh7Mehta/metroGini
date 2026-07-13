import { applyCouponDiscount } from './price.util.js';

const getEstimatedKg = (min, max) => {
  const weightMin = Number(min || 0);
  const weightMax = Number(max || 0);
  if (weightMin && weightMax) {
    return parseFloat(((weightMin + weightMax) / 2).toFixed(1));
  }
  return parseFloat((weightMax || weightMin || 0).toFixed(1));
};

export const buildOrderBillingPayload = (order) => {
  const actualWeight =
    order.actual_weight != null
      ? parseFloat(Number(order.actual_weight).toFixed(1))
      : getEstimatedKg(order.estimated_weight_min, order.estimated_weight_max);

  const ratePerKg =
    Number(order.base_price_per_kg || 0) + Number(order.extra_price_per_kg || 0);

  const additionalCharges = [];

  const flatFee = Number(order.flat_fee || 0);
  if (flatFee > 0) {
    additionalCharges.push({
      name: 'Service Fee',
      qty: 1,
      rate: String(Math.round(flatFee)),
      amount: String(Math.round(flatFee)),
    });
  }

  const peakCharge = Number(order.peak_extra_charge || 0);
  if (peakCharge > 0) {
    additionalCharges.push({
      name: 'Peak Hour Surcharge',
      qty: 1,
      rate: String(Math.round(peakCharge)),
      amount: String(Math.round(peakCharge)),
    });
  }

  const weightMax = Number(order.estimated_weight_max || 0);
  if (order.actual_weight != null && Number(order.actual_weight) > weightMax && weightMax > 0) {
    const extraKg = parseFloat((Number(order.actual_weight) - weightMax).toFixed(1));
    const extraAmount = Math.round(extraKg * ratePerKg);
    if (extraAmount > 0) {
      additionalCharges.push({
        name: 'Extra Weight Charge',
        qty: 1,
        rate: String(extraAmount),
        amount: String(extraAmount),
      });
    }
  }

  const vendorExtra = Number(order.vendor_request_amount || 0);
  const vendorMarkup = Number(order.vendor_request_markup || 0);
  if (Number(order.is_stained) === 1 && vendorExtra > 0) {
    const stainChargeForUser = Math.round(vendorExtra + vendorMarkup);
    additionalCharges.push({
      name: 'Stain / Vendor Extra Charge',
      qty: 1,
      rate: String(stainChargeForUser),
      amount: String(stainChargeForUser),
    });
  }

  const estimatedTotal = Math.round(Number(order.estimated_total || 0));
  const isStained = Number(order.is_stained) === 1;
  const vendorExtraRounded = isStained ? Math.round(vendorExtra) : 0;
  const vendorMarkupRounded = isStained ? Math.round(vendorMarkup) : 0;
  const extraWeightLine = additionalCharges.find(
    (item) => item.name === 'Extra Weight Charge',
  );
  const extraWeightCharge = extraWeightLine ? Number(extraWeightLine.amount) : 0;

  const grossBeforeCoupon = estimatedTotal + extraWeightCharge;
  const { discount: couponDiscount } = applyCouponDiscount(grossBeforeCoupon, order);
  const couponDiscountRounded = Math.round(couponDiscount);
  const netBaseAfterCoupon = Math.round(grossBeforeCoupon - couponDiscountRounded);

  if (couponDiscountRounded > 0) {
    additionalCharges.push({
      name: order.coupon_code || 'Coupon Discount',
      qty: 1,
      rate: `-${couponDiscountRounded}`,
      amount: `-${couponDiscountRounded}`,
      discount_type: order.discount_type || null,
    });
  }

  const subtotalBeforeGst =
    netBaseAfterCoupon + vendorExtraRounded + vendorMarkupRounded;
  const payableGst = Math.round(subtotalBeforeGst * 0.18);
  const payableFinal = subtotalBeforeGst + payableGst;
  const totalAmount =
    order.final_total != null
      ? Math.round(Number(order.final_total))
      : payableFinal;

  return {
    weight_label: `Total Weight Charges - ${actualWeight}kg`,
    weight_amount: String(Math.round(actualWeight * ratePerKg)),
    additional_charges: additionalCharges,
    coupon: order.coupon_code || order.applied_coupon_id
      ? {
          name: order.coupon_code || null,
          discount_type: order.discount_type || null,
          discount_value:
            order.discount_value != null
              ? parseFloat(order.discount_value)
              : null,
          discounted_amount: String(couponDiscountRounded),
        }
      : null,
    subtotal: String(subtotalBeforeGst),
    gst_label: 'GST (18%)',
    gst: String(payableGst),
    total_amount: String(totalAmount),
    pricing_summary: {
      estimated_total: String(estimatedTotal),
      extra_price_per_kg: String(extraWeightCharge),
      coupon_name: order.coupon_code || null,
      discount_type: order.discount_type || null,
      discount_value:
        order.discount_value != null ? String(parseFloat(order.discount_value)) : null,
      coupon_discount: String(couponDiscountRounded),
      vendor_request_amount: String(vendorExtraRounded),
      vendor_request_markup: String(vendorMarkupRounded),
      gst: String(payableGst),
      final_amount: String(totalAmount),
    },
  };
};
