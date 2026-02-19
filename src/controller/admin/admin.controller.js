import sql from "../../config/db.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
  
    const { rows } = await sql.query(
      `SELECT * FROM users WHERE email = $1 and role = 'admin'`,
      [email]
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
      { expiresIn: "1d" }
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

    
