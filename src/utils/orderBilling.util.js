import { applyCouponDiscount, splitGstComponents } from './price.util.js';

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

  const baseRate = Number(order.base_price_per_kg || 0);
  const typeExtraRate = Number(order.extra_price_per_kg || 0);
  const hasConfirmedWeight = order.actual_weight != null;

  // confirmWeightService overwrites extra_price_per_kg with the flat extra-weight CHARGE
  // (not the per-kg rate). Use that charge when weight is already confirmed.
  const ratePerKg = hasConfirmedWeight ? baseRate : baseRate + typeExtraRate;

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

  let extraWeightCharge = 0;
  if (hasConfirmedWeight) {
    // After weight confirm this column holds the extra-weight charge amount
    extraWeightCharge = Math.round(typeExtraRate);
  }

  if (extraWeightCharge > 0) {
    additionalCharges.push({
      name: 'Extra Weight Charge',
      qty: 1,
      rate: String(extraWeightCharge),
      amount: String(extraWeightCharge),
    });
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
  let payableGst = Math.round(subtotalBeforeGst * 0.18);
  let payableFinal = subtotalBeforeGst + payableGst;
  let taxableValue = subtotalBeforeGst;

  const totalAmount =
    order.final_total != null
      ? Math.round(Number(order.final_total))
      : payableFinal;

  // Keep GST lines consistent with the charged grand total
  if (order.final_total != null && payableFinal !== totalAmount) {
    payableGst = Math.round((totalAmount * 0.18) / 1.18);
    taxableValue = totalAmount - payableGst;
    payableFinal = totalAmount;
  }

  const gstParts = splitGstComponents(payableGst);

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
    subtotal: String(taxableValue),
    gst_label: 'GST (18%)',
    gst: String(payableGst),
    cgst: String(gstParts.cgst),
    sgst: String(gstParts.sgst),
    cgst_label: `CGST (${gstParts.cgst_rate}%)`,
    sgst_label: `SGST (${gstParts.sgst_rate}%)`,
    gst_rate: gstParts.gst_rate,
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
      subtotal_before_gst: String(taxableValue),
      gst: String(payableGst),
      cgst: String(gstParts.cgst),
      sgst: String(gstParts.sgst),
      final_amount: String(totalAmount),
    },
  };
};
