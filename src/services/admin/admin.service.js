import sql from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { formatAdminPublic, ADMIN_PANEL_ROLE_FILTER } from "../../utils/adminUser.util.js";

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

  if (hasMax && maxAmount < minAmount) {
    throw {
      status: 400,
      message: 'maximum_amount_value must be greater than or equal to minimum_amount_value',
    };
  }

  return { minAmount, maxAmount };
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
  if (loyaltyAuto && !["percentage", "per_kg"].includes(discount_type)) {
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

    if (loyaltyAuto) {
      await client.query(
        `UPDATE coupons
         SET auto_apply_loyalty = false, updated_at = CURRENT_TIMESTAMP
         WHERE auto_apply_loyalty = true AND discount_type = $1`,
        [discount_type],
      );
    }

    const { rows } = await client.query(
      `INSERT INTO coupons
        (coupon_code, discount_type, discount_value, minimum_amount_value,
         maximum_amount_value, start_date, end_date, is_active, per_user_limit,
         usage_limit, auto_apply_loyalty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
      ],
    );

    await client.query("COMMIT");
    return rows[0];
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
    !["percentage", "per_kg"].includes(discount_type)
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
      `SELECT id, discount_type FROM coupons WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing.rows.length) {
      throw { status: 404, message: "Coupon not found" };
    }

    const nextType = discount_type || existing.rows[0].discount_type;
    const nextLoyalty =
      loyaltyAuto !== undefined
        ? loyaltyAuto
        : (
            await client.query(
              `SELECT auto_apply_loyalty FROM coupons WHERE id = $1`,
              [id],
            )
          ).rows[0].auto_apply_loyalty;

    if (nextLoyalty && !["percentage", "per_kg"].includes(nextType)) {
      throw {
        status: 400,
        message: "auto_apply_loyalty is only allowed for percentage or per_kg coupons",
      };
    }

    if (nextLoyalty) {
      await client.query(
        `UPDATE coupons
         SET auto_apply_loyalty = false, updated_at = CURRENT_TIMESTAMP
         WHERE auto_apply_loyalty = true AND discount_type = $1 AND id <> $2`,
        [nextType, id],
      );
    }

    const { rows } = await client.query(
      `UPDATE coupons
       SET coupon_code = $1, discount_type = $2, discount_value = $3,
           minimum_amount_value = $4, maximum_amount_value = $5,
           start_date = $6, end_date = $7,
           is_active = $8, per_user_limit = $9, usage_limit = $10,
           auto_apply_loyalty = $11,
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
      ],
    );

    await client.query("COMMIT");
    return rows[0];
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
