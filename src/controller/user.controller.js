import { findUserByMobile } from "../models/user.model.js";

export const loginOrRegister = async (req, res, next) => {
  const { mobile } = req.body;

  try {
    let user = await findUserByMobile(mobile); // service function

    let message = "";

    if (!user) {
      const query = `INSERT INTO users (mobile) VALUES ($1) RETURNING *`;
      const values = [mobile];

      const { rows } = await sql.query(query, values);
      user = rows[0];
      message = "User registered successfully. OTP sent.";
    } else {
      message = "User found. OTP sent for login.";
    }

    res.status(200).json({
      success: true,
      message,
      data: {
        id: user.id,
        mobile: user.mobile,
        profile_completed: user.profile_completed,
      },
    });
  } catch (error) {
    console.error("Error in loginOrRegister:", error);
    next(error);
  }
};

export default {
  loginOrRegister,
};
