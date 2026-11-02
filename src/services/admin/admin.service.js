import sql from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { formatAdminPublic, ADMIN_PANEL_ROLE_FILTER } from "../../utils/adminUser.util.js";
import {
  LOYALTY_DISCOUNT_TYPES,
  defaultLoyaltyRangeForType,
} from "../../utils/loyaltyCoupon.util.js";

const BCRYPT_ROUNDS = 10;

export const adminLogin = async (email, password) => {
  const { rows } = await sql.query(
    `SELECT id, full_name, email, status, role, permissions, user_password
     FROM users
     WHERE email = $1 AND ${ADMIN_PANEL_ROLE_FILTER}`,
    [email],
  );
  if (rows.length === 0)
    throw { status: 401, message: "Invalid email or password" };

  const admin = rows[0];

  if (admin.status !== "active") {
    throw { status: 403, message: "Admin account is inactive" };
  }

  const isMatch = await bcrypt.compare(password, admin.user_password);
  if (!isMatch) throw { status: 401, message: "Invalid email or password" };

  const adminData = formatAdminPublic(admin);

  const token = jwt.sign(
    {
      id: adminData.id,
      role: adminData.role,
      permissions: adminData.permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  return {
    token,
    admin: adminData,
  };
};

export const getAdminProfile = async (adminId) => {
  const { rows } = await sql.query(
    `SELECT id, full_name, email, status, role, permissions
     FROM users
     WHERE id = $1 AND ${ADMIN_PANEL_ROLE_FILTER}`,
    [adminId],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Admin not found" };
  }

  return formatAdminPublic(rows[0]);
};

export const changeAdminPassword = async (adminId, body) => {
  const { current_password, new_password, confirm_password } = body;

  if (!current_password || !new_password || !confirm_password) {
    throw { status: 400, message: "All password fields are required" };
  }

  if (new_password !== confirm_password) {
    throw { status: 400, message: "New password and confirm password do not match" };
  }

  if (new_password.length < 6) {
    throw { status: 400, message: "New password must be at least 6 characters" };
  }

  const { rows } = await sql.query(
    `SELECT id, user_password FROM users WHERE id = $1 AND ${ADMIN_PANEL_ROLE_FILTER}`,
    [adminId],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Admin not found" };
  }

  const admin = rows[0];
  const isMatch = await bcrypt.compare(current_password, admin.user_password);
  if (!isMatch) {
    throw { status: 400, message: "Current password is incorrect" };
  }

  const passwordHash = await bcrypt.hash(String(new_password), BCRYPT_ROUNDS);
  await sql.query(
    `UPDATE users
     SET user_password = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND ${ADMIN_PANEL_ROLE_FILTER}`,
    [passwordHash, adminId],
  );
};

const resolveCouponAmountBounds = (minimum_amount_value, maximum_amount_value) => {
  const minAmount = Number(minimum_amount_value || 0);
  const hasMax =
    maximum_amount_value != null &&
    maximum_amount_value !== '' &&
    !Number.isNaN(Number(maximum_amount_value));
  const maxAmount = hasMax ? Number(maximum_amount_value) : null;

  if (Number.isNaN(minAmount) || minAmount < 0) {
    throw { status: 400, message: 'minimum_amount_value must be a non-negative number' };
  }

  if (hasMax && maxAmount < 0) {
    throw { status: 400, message: 'maximum_amount_value must be a non-negative number' };
  }

  return { minAmount, maxAmount };
};

const hasField = (body, key) =>
  Object.prototype.hasOwnProperty.call(body || {}, key);

const parseLoyaltyOrderNumber = (value, field) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw { status: 400, message: `${field} must be a whole number of 1 or more` };
  }
  return n;
};

/**
 * Loyalty sequence range for a coupon. Missing fields fall back to the
 * existing row, then to the legacy default for the discount type
 * (percentage → order 1, per_kg → order 2+).
 */
const resolveLoyaltyRange = (body, discountType, existing = null) => {
  const fallback = defaultLoyaltyRangeForType(discountType);
  const hasExisting = existing?.loyalty_order_from != null;

  const from =
    hasField(body, "loyalty_order_from") &&
    body.loyalty_order_from !== null &&
    body.loyalty_order_from !== ""
      ? parseLoyaltyOrderNumber(body.loyalty_order_from, "loyalty_order_from")
      : hasExisting
        ? Number(existing.loyalty_order_from)
        : fallback.from;

  let to;
  if (hasField(body, "loyalty_order_to")) {
    to =
      body.loyalty_order_to === null || body.loyalty_order_to === ""
        ? null
        : parseLoyaltyOrderNumber(body.loyalty_order_to, "loyalty_order_to");
  } else if (hasExisting) {
    to = existing.loyalty_order_to == null ? null : Number(existing.loyalty_order_to);
  } else {
    to = fallback.to;
  }

  if (to != null && to < from) {
    throw {
      status: 400,
      message: "loyalty_order_to must be greater than or equal to loyalty_order_from",
    };
  }

  return { from, to };
};

/** One loyalty coupon per order number — switch off any whose range overlaps. */
const releaseOverlappingLoyaltyCoupons = async (client, { from, to }, excludeId = null) => {
  const { rows } = await client.query(
    `UPDATE coupons
     SET auto_apply_loyalty = false, updated_at = CURRENT_TIMESTAMP
     WHERE auto_apply_loyalty = true
       AND ($3::int IS NULL OR id <> $3)
       AND COALESCE(loyalty_order_from, 1) <= COALESCE($2::int, 2147483647)
       AND COALESCE(loyalty_order_to, 2147483647) >= $1::int
     RETURNING coupon_code`,
    [from, to, excludeId],
  );
  return rows.map((r) => r.coupon_code);
};

export const insertCoupon = async (body) => {
  const {
    coupon_code,
    discount_type,
    discount_value,
    minimum_amount_value,
    maximum_amount_value,
    start_date,
    end_date,
    is_active,
    per_user_limit,
    usage_limit,
    auto_apply_loyalty,
  } = body;

  if (
    !coupon_code ||
    !discount_type ||
    !discount_value ||
    !start_date ||
    !end_date
  )
    throw { status: 400, message: "Required fields are missing" };

  if (!["percentage", "flat", "per_kg"].includes(discount_type))
    throw { status: 400, message: "Invalid discount type" };

  if (Number(discount_value) <= 0)
    throw { status: 400, message: "Discount value must be greater than 0" };

  if (new Date(start_date) >= new Date(end_date))
    throw { status: 400, message: "End date must be greater than start date" };

  const loyaltyAuto = Boolean(auto_apply_loyalty);
  if (loyaltyAuto && !LOYALTY_DISCOUNT_TYPES.includes(discount_type)) {
    throw {
      status: 400,
      message: "auto_apply_loyalty is only allowed for percentage or per_kg coupons",
    };
  }

  const loyaltyRange = loyaltyAuto
    ? resolveLoyaltyRange(body, discount_type)
    : { from: null, to: null };

  const { minAmount, maxAmount } = resolveCouponAmountBounds(
    minimum_amount_value,
    maximum_amount_value,
  );

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const replaced = loyaltyAuto
      ? await releaseOverlappingLoyaltyCoupons(client, loyaltyRange)
      : [];

    const { rows } = await client.query(
      `INSERT INTO coupons
        (coupon_code, discount_type, discount_value, minimum_amount_value,
         maximum_amount_value, start_date, end_date, is_active, per_user_limit,
         usage_limit, auto_apply_loyalty, loyalty_order_from, loyalty_order_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        coupon_code.trim().toUpperCase(),
        discount_type,
        discount_value,
        minAmount,
        maxAmount,
        start_date,
        end_date,
        is_active ?? true,
        per_user_limit ?? 1,
        usage_limit ?? null,
        loyaltyAuto,
        loyaltyRange.from,
        loyaltyRange.to,
      ],
    );

    await client.query("COMMIT");
    return { ...rows[0], replaced_loyalty_coupons: replaced };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const editCoupon = async (id, body) => {
  const {
    coupon_code,
    discount_type,
    discount_value,
    minimum_amount_value,
    maximum_amount_value,
    start_date,
    end_date,
    is_active,
    per_user_limit,
    usage_limit,
    auto_apply_loyalty,
  } = body;

  if (discount_type && !["percentage", "flat", "per_kg"].includes(discount_type)) {
    throw { status: 400, message: "Invalid discount type" };
  }

  const loyaltyAuto =
    auto_apply_loyalty !== undefined ? Boolean(auto_apply_loyalty) : undefined;

  if (
    loyaltyAuto === true &&
    discount_type &&
    !LOYALTY_DISCOUNT_TYPES.includes(discount_type)
  ) {
    throw {
      status: 400,
      message: "auto_apply_loyalty is only allowed for percentage or per_kg coupons",
    };
  }

  const { minAmount, maxAmount } = resolveCouponAmountBounds(
    minimum_amount_value,
    maximum_amount_value,
  );

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, discount_type, auto_apply_loyalty,
              loyalty_order_from, loyalty_order_to
       FROM coupons WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing.rows.length) {
      throw { status: 404, message: "Coupon not found" };
    }

    const existingRow = existing.rows[0];
    const nextType = discount_type || existingRow.discount_type;
    const nextLoyalty =
      loyaltyAuto !== undefined ? loyaltyAuto : existingRow.auto_apply_loyalty;

    if (nextLoyalty && !LOYALTY_DISCOUNT_TYPES.includes(nextType)) {
      throw {
        status: 400,
        message: "auto_apply_loyalty is only allowed for percentage or per_kg coupons",
      };
    }

    const loyaltyRange = nextLoyalty
      ? resolveLoyaltyRange(body, nextType, existingRow)
      : {
          from: existingRow.loyalty_order_from,
          to: existingRow.loyalty_order_to,
        };

    const replaced = nextLoyalty
      ? await releaseOverlappingLoyaltyCoupons(client, loyaltyRange, id)
      : [];

    const { rows } = await client.query(
      `UPDATE coupons
       SET coupon_code = $1, discount_type = $2, discount_value = $3,
           minimum_amount_value = $4, maximum_amount_value = $5,
           start_date = $6, end_date = $7,
           is_active = $8, per_user_limit = $9, usage_limit = $10,
           auto_apply_loyalty = $11,
           loyalty_order_from = $13, loyalty_order_to = $14,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
       RETURNING *`,
      [
        coupon_code.trim().toUpperCase(),
        discount_type,
        discount_value,
        minAmount,
        maxAmount,
        start_date,
        end_date,
        is_active,
        per_user_limit,
        usage_limit,
        Boolean(nextLoyalty),
        id,
        loyaltyRange.from,
        loyaltyRange.to,
      ],
    );

    await client.query("COMMIT");
    return { ...rows[0], replaced_loyalty_coupons: replaced };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getAllCoupons = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM coupons ORDER BY id DESC`,
  );
  return rows;
};

export const getCoupon = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
  if (rows.length === 0) throw { status: 404, message: "Coupon not found" };
  return rows[0];
};
