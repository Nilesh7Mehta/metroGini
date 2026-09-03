import sql from "../../config/db.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { findUserByMobile } from "../../models/user.model.js";

const MOBILE_REGEX = /^\d{10,15}$/;

export const normalizeWhatsappMobile = (value) => {
  let mobile = String(value || "").trim().replace(/[\s\-()]/g, "");
  if (mobile.startsWith("+")) mobile = mobile.slice(1);
  // India: 91XXXXXXXXXX → last 10 digits for DB match
  if (mobile.length === 12 && mobile.startsWith("91")) {
    mobile = mobile.slice(2);
  }
  if (mobile.length === 11 && mobile.startsWith("0")) {
    mobile = mobile.slice(1);
  }
  return mobile;
};

export const assertValidMobile = (mobile) => {
  const normalized = normalizeWhatsappMobile(mobile);
  if (!MOBILE_REGEX.test(normalized)) {
    throw {
      status: 400,
      message: "mobile must be a valid phone number (10–15 digits)",
    };
  }
  return normalized;
};

const issueTokens = async (user) => {
  const accessToken = jwt.sign(
    { id: user.id, mobile: user.mobile, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await sql.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshToken, expiresAt],
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: process.env.JWT_EXPIRES_IN || "7d",
  };
};

const loadCustomerSnapshot = async (userId) => {
  const { rows: orderRows } = await sql.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('draft', 'cancelled'))::int AS total_orders,
       COUNT(*) FILTER (
         WHERE status NOT IN ('draft', 'cancelled', 'delivered')
       )::int AS active_orders,
       MAX(id) FILTER (
         WHERE status NOT IN ('draft', 'cancelled', 'delivered')
       ) AS active_order_id,
       MAX(id) FILTER (WHERE status = 'draft') AS draft_order_id
     FROM orders
     WHERE user_id = $1`,
    [userId],
  );

  const { rows: addrRows } = await sql.query(
    `SELECT id, complete_address, floor, landmark, pincode, address_type, is_selected
     FROM user_address_details
     WHERE user_id = $1
     ORDER BY is_selected DESC NULLS LAST, id DESC
     LIMIT 1`,
    [userId],
  );

  const { rows: deviceRows } = await sql.query(
    `SELECT 1 FROM device_tokens
     WHERE identity_id = $1 AND role = 'user'
     LIMIT 1`,
    [userId],
  );

  const stats = orderRows[0] || {};
  const address = addrRows[0]
    ? {
        id: Number(addrRows[0].id),
        complete_address: addrRows[0].complete_address,
        floor: addrRows[0].floor,
        landmark: addrRows[0].landmark,
        pincode: addrRows[0].pincode,
        address_type: addrRows[0].address_type,
        is_selected: Boolean(addrRows[0].is_selected),
      }
    : null;

  return {
    total_orders: Number(stats.total_orders || 0),
    active_orders: Number(stats.active_orders || 0),
    active_order_id: stats.active_order_id
      ? Number(stats.active_order_id)
      : null,
    draft_order_id: stats.draft_order_id
      ? Number(stats.draft_order_id)
      : null,
    has_app: deviceRows.length > 0,
    default_address: address,
  };
};

/**
 * Create or reuse user from WhatsApp mobile and issue JWT (no OTP).
 */
export const createWhatsappSession = async ({ mobile }) => {
  const normalized = assertValidMobile(mobile);

  let user = await findUserByMobile(normalized);
  let created = false;

  if (!user) {
    const { rows } = await sql.query(
      `INSERT INTO users (mobile, terms_and_condition)
       VALUES ($1, TRUE)
       RETURNING *`,
      [normalized],
    );
    user = rows[0];
    created = true;
  } else if (!user.terms_and_condition) {
    await sql.query(
      `UPDATE users SET terms_and_condition = TRUE WHERE id = $1`,
      [user.id],
    );
    user.terms_and_condition = true;
  }

  const tokens = await issueTokens(user);
  const snapshot = await loadCustomerSnapshot(user.id);

  return {
    success: true,
    message: created
      ? "WhatsApp session created for new user"
      : "WhatsApp session created",
    data: {
      ...tokens,
      user_id: user.id,
      customer_id: `MG-${user.id}`,
      mobile: user.mobile,
      full_name: user.full_name || null,
      email: user.email || null,
      profile_completed: Boolean(user.profile_completed),
      terms_and_condition: true,
      is_new_user: created,
      ...snapshot,
    },
  };
};

/**
 * Soft lookup — does not create user or issue token.
 */
export const lookupWhatsappCustomer = async ({ mobile }) => {
  const normalized = assertValidMobile(mobile);
  const user = await findUserByMobile(normalized);

  if (!user) {
    return {
      success: true,
      message: "Customer not found",
      data: {
        exists: false,
        mobile: normalized,
        user_id: null,
        full_name: null,
        customer_id: null,
        total_orders: 0,
        active_order_id: null,
        draft_order_id: null,
        has_app: false,
        default_address: null,
      },
    };
  }

  const snapshot = await loadCustomerSnapshot(user.id);

  return {
    success: true,
    message: "Customer found",
    data: {
      exists: true,
      mobile: user.mobile,
      user_id: user.id,
      customer_id: `MG-${user.id}`,
      full_name: user.full_name || null,
      email: user.email || null,
      profile_completed: Boolean(user.profile_completed),
      ...snapshot,
    },
  };
};
