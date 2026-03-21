import sql from "../../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const adminLogin = async (email, password) => {
  const { rows } = await sql.query(
    `SELECT * FROM users WHERE email = $1 AND role = 'admin'`,
    [email],
  );
  if (rows.length === 0)
    throw { status: 401, message: "Invalid email or password" };

  const admin = rows[0];
  const isMatch = await bcrypt.compare(password, admin.user_password);
  if (!isMatch) throw { status: 401, message: "Invalid email or password" };

  const token = jwt.sign(
    { id: admin.id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  return { token, data: { id: admin.id, email: admin.email } };
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
    `SELECT * FROM coupons ORDER BY created_at DESC`,
  );
  return rows;
};

export const getCoupon = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
  if (rows.length === 0) throw { status: 404, message: "Coupon not found" };
  return rows[0];
};
