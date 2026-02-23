import sql from "../../config/db.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await sql.query(
      `SELECT * FROM users WHERE email = $1 and role = 'admin'`,
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const admin = rows[0];

    // 2️⃣ Compare hashed password
    const isMatch = await bcrypt.compare(password, admin.user_password);

    if (!isMatch) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: "Invalid email or password",
      });
    }

    // 3️⃣ Generate JWT token (recommended)
    const token = jwt.sign(
      { id: admin.id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.status(200).json({
      success: true,
      message: "Admin logged in successfully",
      token,
      data: {
        id: admin.id,
        email: admin.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const {
      coupon_code,
      discount_type,
      discount_value,
      minimum_amount_value,
      start_date,
      end_date,
      is_active,
      per_user_limit,
      usage_limit
    } = req.body;

    if (
      !coupon_code ||
      !discount_type ||
      !discount_value ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({
        message: "Required fields are missing",
      });
    }

    if (!["percentage", "flat"].includes(discount_type)) {
      return res.status(400).json({
        message: "Invalid discount type",
      });
    }

    if (Number(discount_value) <= 0) {
      return res.status(400).json({
        message: "Discount value must be greater than 0",
      });
    }

    if (new Date(start_date) >= new Date(end_date)) {
      return res.status(400).json({
        message: "End date must be greater than start date",
      });
    }

    const query = `
      INSERT INTO coupons
      (coupon_code, discount_type, discount_value, minimum_amount_value,
       start_date, end_date, is_active, per_user_limit, usage_limit)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `;

    const values = [
      coupon_code.trim().toUpperCase(),
      discount_type,
      discount_value,
      minimum_amount_value || 0,
      start_date,
      end_date,
      is_active ?? true,
      per_user_limit ?? 1,
      usage_limit ?? null
    ];

    const result = await sql.query(query, values);

    return res.status(200).json({
      message: "Coupon created successfully",
      data: result.rows[0],
    });

  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        message: "Coupon code already exists",
      });
    }
    next(error);
  }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      coupon_code,
      discount_type,
      discount_value,
      minimum_amount_value,
      start_date,
      end_date,
      is_active,
      per_user_limit,
      usage_limit
    } = req.body;

    const query = `
      UPDATE coupons
      SET 
        coupon_code = $1,
        discount_type = $2,
        discount_value = $3,
        minimum_amount_value = $4,
        start_date = $5,
        end_date = $6,
        is_active = $7,
        per_user_limit = $8,
        usage_limit = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *;
    `;

    const values = [
      coupon_code.trim().toUpperCase(),
      discount_type,
      discount_value,
      minimum_amount_value,
      start_date,
      end_date,
      is_active,
      per_user_limit,
      usage_limit,
      id
    ];

    const result = await sql.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Coupon not found"
      });
    }

    return res.status(200).json({
      message: "Coupon updated successfully",
      data: result.rows[0],
    });

  } catch (error) {
    next(error);
  }
};

export const getCoupons = async (req, res, next) => {
  try {
    const { rows } = await sql.query(
      `SELECT * FROM coupons ORDER BY created_at DESC`
    );

    return res.status(200).json({
      success: true,
      data: rows,
    });

  } catch (error) {
    next(error);
  }
};

export const getCouponById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await sql.query(
      `SELECT * FROM coupons WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon retrieved successfully",
      data: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
};