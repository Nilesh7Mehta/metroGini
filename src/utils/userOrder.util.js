import { buildOrderTimestamps } from "./datetime.util.js";

/** Normalizes app filter values: "BOOKED", "OUT FOR PICKUP", "LAST 7 DAYS" → snake_case lowercase */
export const normalizeOrderListFilter = (value) => {
  if (value == null || value === "") return value;
  return String(value).trim().toLowerCase().replace(/\s+/g, "_");
};

/** Allowed `status` query values for GET /api/user/order/getUserOrder */
export const USER_ORDER_FILTER_STATUSES = [
  "booked",
  "out_for_pickup",
  "pickup_in_progress",
  "picked_up",
  "in_process",
  "order_finalized",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export const formatUserOrder = (order) => ({
  order_id: order.id,
  status: order.status,
  service_name: order.service_name,
  service_image: order.service_image,
  is_stained: order.is_stained,
  is_damaged: order.is_damaged != null ? Number(order.is_damaged) : 0,
  damage_count:
    order.damage_count != null ? Number(order.damage_count) : null,
  damage_images: (() => {
    let list = order.damage_images;
    if (typeof list === 'string' && list.trim()) {
      try {
        const parsed = JSON.parse(list);
        list = Array.isArray(parsed) ? parsed : [list];
      } catch {
        list = [list];
      }
    }
    if (!Array.isArray(list)) return null;
    const images = list
      .map((item) => {
        if (typeof item === 'string' && item.trim()) return item.trim();
        if (item && typeof item === 'object') {
          const path = String(item.path || item.url || item.image || '').trim();
          return path || null;
        }
        return null;
      })
      .filter(Boolean);
    return images.length ? images : null;
  })(),
  pickup_slot: {
    date: order.pickup_date,
    time: `${order.pickup_start} - ${order.pickup_end}`,
  },
  delivery_slot: {
    date: order.delivery_date,
    time: `${order.delivery_start} - ${order.delivery_end}`,
  },
  special_instructions: {
    pickup: order.pickup_special_instruction ?? null,
    delivery: order.delivery_special_instruction ?? null,
  },
  item_details: {
    clothes_count: order.clothes_count,
    estimated_weight: `${order.estimated_weight_min} - ${order.estimated_weight_max} kg`,
  },
  pricing: {
    estimated_total:
      order.estimated_total != null
        ? parseFloat(order.estimated_total)
        : null,
    base_total:
      order.final_total != null
        ? parseFloat(
            (
              Number(order.final_total) -
              Number(order.is_stained ? order.vendor_request_amount || 0 : 0)
            ).toFixed(2),
          )
        : null,
    vendor_request_amount:
      order.vendor_request_amount != null
        ? parseFloat(order.vendor_request_amount)
        : null,
    final_total:
      order.final_total != null ? parseFloat(order.final_total) : null,
    remaining_amount:
      order.remaining_amount != null
        ? parseFloat(order.remaining_amount)
        : null,
    amount_paid:
      order.amount_paid != null ? parseFloat(order.amount_paid) : null,
    discount_price:
      order.discount_price != null ? parseFloat(order.discount_price) : null,
    extra_price_per_kg:
      order.extra_price_per_kg != null
        ? parseFloat(order.extra_price_per_kg)
        : null,
  },
  payment_status: order.payment_status || "pending",
  timestamps: buildOrderTimestamps(order),
});
