export const applyCouponDiscount = (grossTotal, order) => {
  const gross = Number(grossTotal);
  let discount = 0;
  const hasCoupon = order.coupon_id || order.applied_coupon_id;
  const minAmount = Number(order.minimum_amount_value || 0);
  const maxRaw = order.maximum_amount_value;
  const hasMax =
    maxRaw != null && maxRaw !== '' && !Number.isNaN(Number(maxRaw));
  const withinMin = gross >= minAmount;
  const withinMax = !hasMax || gross <= Number(maxRaw);

  if (hasCoupon && withinMin && withinMax) {
    if (order.discount_type === 'percentage') {
      discount = (gross * Number(order.discount_value)) / 100;
    } else if (order.discount_type === 'flat') {
      discount = Number(order.discount_value);
    }
  }

  let net_total = parseFloat((gross - discount).toFixed(2));

  if (net_total < 500) {
    discount = gross - 500;
    net_total = 500;
  }

  return {
    gross_total: gross,
    discount: parseFloat(discount.toFixed(2)),
    net_total,
  };
};

export const applyGst = (subtotal) => {
  const amount = parseFloat(Number(subtotal).toFixed(2));
  const gst = Math.round(amount * 0.18);

  return {
    subtotal_before_gst: amount,
    gst,
    final_total: parseFloat((amount + gst).toFixed(2)),
  };
};

export const calculateOrderPricing = (order) => {

  // 🧮 Weight calculation
  const avg_weight =
    (Number(order.estimated_weight_min) +
     Number(order.estimated_weight_max)) / 2;

  const service_charge =
    avg_weight * Number(order.base_price_per_kg);

  const type_extra =
    avg_weight * Number(order.extra_price_per_kg);

  const flat_fee = Number(order.flat_fee);

  const peak_charge =
    order.is_peak ? Number(order.peak_extra_charge) : 0;

  const gross_total =
    service_charge + type_extra + flat_fee + peak_charge;

  const { discount, net_total: final_total } = applyCouponDiscount(gross_total, order);

  // 💰 Advance Logic
  const advance_payment = Math.min(500, final_total);
  const remaining_payment = final_total - advance_payment;

  return {
    avg_weight,
    service_charge,
    type_extra,
    flat_fee,
    peak_charge,
    gross_total,
    discount,
    final_total,
    advance_payment,
    remaining_payment
  };
};