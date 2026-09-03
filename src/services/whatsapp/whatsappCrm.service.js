import sql from "../../config/db.js";
import { assertValidMobile } from "./whatsappAuth.service.js";

/**
 * Registered users (users.created_at) with zero completed orders, idle for `hours`.
 * Does not require FCM / device_tokens.
 */
export const listInactiveAppUsers = async ({ hours = 48, limit = 100 } = {}) => {
  const h = Math.max(1, Number(hours) || 48);
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));

  const { rows } = await sql.query(
    `
    WITH order_counts AS (
      SELECT user_id,
             COUNT(*) FILTER (WHERE status NOT IN ('draft', 'cancelled'))::int AS total_orders
      FROM orders
      GROUP BY user_id
    )
    SELECT u.id AS user_id,
           u.mobile,
           u.full_name,
           u.created_at AS registered_at,
           COALESCE(oc.total_orders, 0) AS total_orders
    FROM users u
    LEFT JOIN order_counts oc ON oc.user_id = u.id
    WHERE u.role = 'user'
      AND COALESCE(oc.total_orders, 0) = 0
      AND u.created_at <= NOW() - ($1::int * INTERVAL '1 hour')
    ORDER BY u.created_at ASC
    LIMIT $2
    `,
    [h, lim],
  );

  return {
    success: true,
    message: "Inactive registered users retrieved",
    data: rows.map((r) => ({
      user_id: Number(r.user_id),
      mobile: r.mobile,
      full_name: r.full_name || null,
      customer_id: `MG-${r.user_id}`,
      total_orders: Number(r.total_orders),
      registered_at: r.registered_at,
    })),
  };
};

/**
 * Latest draft order for a mobile (abandoned booking resume).
 */
export const getAbandonedBooking = async ({ mobile }) => {
  const normalized = assertValidMobile(mobile);

  const { rows } = await sql.query(
    `
    SELECT o.id,
           o.order_code,
           o.clothes_count,
           o.estimated_weight_min,
           o.estimated_weight_max,
           o.estimated_total,
           o.service_id,
           o.service_type_id,
           o.pickup_date,
           o.updated_at,
           s.name AS service_name
    FROM users u
    INNER JOIN orders o ON o.user_id = u.id AND o.status = 'draft'
    LEFT JOIN services s ON s.id = o.service_id
    WHERE u.mobile = $1
    ORDER BY o.updated_at DESC NULLS LAST, o.id DESC
    LIMIT 1
    `,
    [normalized],
  );

  if (rows.length === 0) {
    return {
      success: true,
      message: "No abandoned booking",
      data: { has_draft: false, mobile: normalized },
    };
  }

  const o = rows[0];
  const count = Number(o.clothes_count || 0);
  let clothes_band = null;
  if (count >= 10 && count <= 13) clothes_band = "10-13";
  else if (count >= 14 && count <= 18) clothes_band = "14-18";
  else if (count >= 19 && count <= 25) clothes_band = "19-25";
  else if (count > 25) clothes_band = "25+";

  return {
    success: true,
    message: "Abandoned booking found",
    data: {
      has_draft: true,
      mobile: normalized,
      order_id: Number(o.id),
      order_code: o.order_code,
      clothes_count: count,
      clothes_band,
      estimated_kg:
        o.estimated_weight_min != null
          ? `${o.estimated_weight_min}-${o.estimated_weight_max}`
          : null,
      estimated_total: o.estimated_total != null ? Number(o.estimated_total) : null,
      service_id: o.service_id,
      service_name: o.service_name,
      service_type_id: o.service_type_id,
      pickup_date: o.pickup_date,
      updated_at: o.updated_at,
    },
  };
};

/**
 * Win-back: exactly N completed orders, last order older than `days`.
 */
export const listWinbackUsers = async ({
  days = 30,
  total_orders = 1,
  limit = 100,
} = {}) => {
  const d = Math.max(1, Number(days) || 30);
  const n = Math.max(1, Number(total_orders) || 1);
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));

  const { rows } = await sql.query(
    `
    WITH completed AS (
      SELECT user_id,
             COUNT(*)::int AS total_orders,
             MAX(COALESCE(delivered_at, updated_at, created_at)) AS last_order_date
      FROM orders
      WHERE status NOT IN ('draft', 'cancelled')
      GROUP BY user_id
    )
    SELECT u.id AS user_id,
           u.mobile,
           u.full_name,
           c.total_orders,
           c.last_order_date,
           a.id AS address_id,
           a.complete_address,
           a.pincode
    FROM completed c
    INNER JOIN users u ON u.id = c.user_id AND u.role = 'user'
    LEFT JOIN LATERAL (
      SELECT id, complete_address, pincode
      FROM user_address_details
      WHERE user_id = u.id
      ORDER BY is_selected DESC NULLS LAST, id DESC
      LIMIT 1
    ) a ON TRUE
    WHERE c.total_orders = $1
      AND c.last_order_date <= NOW() - ($2::int * INTERVAL '1 day')
    ORDER BY c.last_order_date ASC
    LIMIT $3
    `,
    [n, d, lim],
  );

  return {
    success: true,
    message: "Win-back users retrieved",
    data: rows.map((r) => ({
      user_id: Number(r.user_id),
      mobile: r.mobile,
      full_name: r.full_name || null,
      customer_id: `MG-${r.user_id}`,
      total_orders: Number(r.total_orders),
      last_order_date: r.last_order_date,
      default_address: r.address_id
        ? {
            id: Number(r.address_id),
            complete_address: r.complete_address,
            pincode: r.pincode,
          }
        : null,
    })),
  };
};
