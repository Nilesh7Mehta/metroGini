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

  // 🎟 Coupon Logic
  let discount = 0;

  if (order.coupon_id) {

    if (gross_total >= Number(order.minimum_amount_value)) {

      if (order.discount_type === "percentage") {
        discount =
          (gross_total * Number(order.discount_value)) / 100;
      }

      if (order.discount_type === "flat") {
        discount = Number(order.discount_value);
      }
    }
  }

  // 🔒 Ensure minimum payable ₹500
  let final_total = gross_total - discount;

  if (final_total < 500) {
    discount = gross_total - 500;
    final_total = 500;
  }

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