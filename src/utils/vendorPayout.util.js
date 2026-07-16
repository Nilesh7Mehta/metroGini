const DEFAULT_VENDOR_PER_KG = 90;

/** Per-kg rate frozen on the order; falls back to live vendor rate for legacy rows. */
export const resolveVendorAmountPerKg = (order, liveVendorRate) => {
  if (order?.vendor_amount_per_kg != null && order.vendor_amount_per_kg !== '') {
    return parseFloat(Number(order.vendor_amount_per_kg).toFixed(2));
  }

  const live =
    liveVendorRate ??
    order?.vendor_per_kg_amount ??
    order?.live_vendor_per_kg_amount;

  return parseFloat(Number(live || DEFAULT_VENDOR_PER_KG).toFixed(2));
};

export const computeVendorRevenue = ({
  actual_weight,
  vendor_amount_per_kg,
  vendor_request_amount = 0,
  live_vendor_per_kg_amount,
}) => {
  const weight = Number(actual_weight || 0);
  const rate = resolveVendorAmountPerKg(
    { vendor_amount_per_kg },
    live_vendor_per_kg_amount,
  );
  const stainExtra = Number(vendor_request_amount || 0);

  return parseFloat((weight * rate + stainExtra).toFixed(2));
};
