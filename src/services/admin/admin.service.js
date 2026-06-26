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

export const insertCoupon = async (body) => {
  const {
    coupon_code,
    discount_type,
    discount_value,
    minimum_amount_value,
    start_date,
    end_date,
    is_active,
    per_user_limit,
    usage_limit,
  } = body;

  if (
    !coupon_code ||
    !discount_type ||
    !discount_value ||
    !start_date ||
    !end_date
  )
    throw { status: 400, message: "Required fields are missing" };

  if (!["percentage", "flat"].includes(discount_type))
    throw { status: 400, message: "Invalid discount type" };

  if (Number(discount_value) <= 0)
    throw { status: 400, message: "Discount value must be greater than 0" };

  if (new Date(start_date) >= new Date(end_date))
    throw { status: 400, message: "End date must be greater than start date" };

  const { rows } = await sql.query(
    `INSERT INTO coupons
      (coupon_code, discount_type, discount_value, minimum_amount_value,
       start_date, end_date, is_active, per_user_limit, usage_limit)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      coupon_code.trim().toUpperCase(),
      discount_type,
      discount_value,
      minimum_amount_value || 0,
      start_date,
      end_date,
      is_active ?? true,
      per_user_limit ?? 1,
      usage_limit ?? null,
    ],
  );
  return rows[0];
};

export const editCoupon = async (id, body) => {
  const {
    coupon_code,
    discount_type,
    discount_value,
    minimum_amount_value,
    start_date,
    end_date,
    is_active,
    per_user_limit,
    usage_limit,
  } = body;

  const { rows } = await sql.query(
    `UPDATE coupons
     SET coupon_code = $1, discount_type = $2, discount_value = $3,
         minimum_amount_value = $4, start_date = $5, end_date = $6,
         is_active = $7, per_user_limit = $8, usage_limit = $9,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $10
     RETURNING *`,
    [
      coupon_code.trim().toUpperCase(),
      discount_type,
      discount_value,
      minimum_amount_value,
      start_date,
      end_date,
      is_active,
      per_user_limit,
      usage_limit,
      id,
    ],
  );
  if (rows.length === 0) throw { status: 404, message: "Coupon not found" };
  return rows[0];
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
