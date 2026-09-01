import sql from "../../config/db.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { findUserByMobile } from "../../models/user.model.js";
import { sendEmailSafe, sendOtpEmail } from "../common/email.service.js";
import { sendPushSafe } from "../common/push.service.js";
import { sendSmsSafe } from "../common/sms.service.js";
import { SMS_TEMPLATE_KEYS } from "../../utils/smsTemplates.js";
import { accountOtpTemplate } from "../../utils/userNotificationTemplates.js";
import { resolveAuthOtpForMobile } from "../../utils/otp.js";

// Check if user exists by mobile; if not create, then generate OTP and store it.
export const loginOrRegister = async ({ mobile }) => {
  let user = await findUserByMobile(mobile);
  let message;

  if (!user) {
    const { rows } = await sql.query(
      `INSERT INTO users (mobile) VALUES ($1) RETURNING *`,
      [mobile],
    );
    user = rows[0];
    message = "User registered successfully. OTP sent.";
  } else {
    message = "User found. OTP sent for login.";
  }

  const otp = resolveAuthOtpForMobile(mobile);

  // Update OTP and expiry (template: valid 10 minutes)
  await sql.query(
    `UPDATE users
     SET otp = $2,
         otp_expires_at = NOW() + INTERVAL '10 minutes',
         otp_attempts = 0
     WHERE id = $1`,
    [user.id, otp],
  );

  // Push only (do not clutter in-app notification inbox with OTPs)
  const otpPush = accountOtpTemplate({ otp });
  sendPushSafe(user.id, {
    title: otpPush.title,
    body: otpPush.message,
    reference_type: "auth",
    reference_id: user.id,
    data: otpPush.data,
  });

  if (user.email) {
    sendEmailSafe(sendOtpEmail, {
      email: user.email,
      name: user.full_name,
      otp,
    });
  }

  sendSmsSafe(
    SMS_TEMPLATE_KEYS.OTP_CREATE_ACCOUNT,
    user.mobile,
    { otp },
    { reference_type: "auth", reference_id: user.id },
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message,
      data: {
        id: user.id,
        mobile: user.mobile,
        otp, // remove in production
        profile_completed: user.profile_completed,
        terms_and_condition: Boolean(user.terms_and_condition),
      },
    },
  };
};

export const resendOtp = async ({ mobile }) => {
  if (!mobile) {
    return {
      statusCode: 400,
      body: { success: false, message: "Mobile is required" },
    };
  }

  const user = await findUserByMobile(mobile);

  if (!user) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found. Please login or register first." },
    };
  }

  const otp = resolveAuthOtpForMobile(mobile);

  await sql.query(
    `UPDATE users
     SET otp = $2,
         otp_expires_at = NOW() + INTERVAL '10 minutes',
         otp_attempts = 0
     WHERE id = $1`,
    [user.id, otp],
  );

  const otpPush = accountOtpTemplate({ otp });
  sendPushSafe(user.id, {
    title: otpPush.title,
    body: otpPush.message,
    reference_type: "auth",
    reference_id: user.id,
    data: otpPush.data,
  });

  if (user.email) {
    sendEmailSafe(sendOtpEmail, {
      email: user.email,
      name: user.full_name,
      otp,
    });
  }

  sendSmsSafe(
    SMS_TEMPLATE_KEYS.OTP_CREATE_ACCOUNT,
    user.mobile,
    { otp },
    { reference_type: "auth", reference_id: user.id },
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "OTP resent successfully",
      data: {
        id: user.id,
        mobile: user.mobile,
        otp, // remove in production
      },
    },
  };
};

export const verifyOTP = async ({ mobile, otp }) => {
  if (!mobile || !otp) {
    return {
      statusCode: 400,
      body: { success: false, message: "Mobile and OTP are required" },
    };
  }

  const userResult = await sql.query(
    `SELECT * FROM users WHERE mobile = $1`,
    [mobile],
  );

  if (userResult.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found" },
    };
  }

  const user = userResult.rows[0];

  if (user.otp !== otp) {
    return {
      statusCode: 400,
      body: { success: false, message: "Invalid OTP" },
    };
  }

  await sql.query(
    `UPDATE users SET terms_and_condition = TRUE WHERE id = $1`,
    [user.id],
  );

  // ✅ Access Token (short expiry)
  const accessToken = jwt.sign(
    { id: user.id, mobile: user.mobile, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );

  // ✅ Refresh Token (long expiry)
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Store refresh token in DB
  await sql.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshToken, expiresAt],
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: process.env.JWT_EXPIRES_IN || "15m",
        profile_completed: user.profile_completed,
        terms_and_condition: true,
      },
    },
  };
};

// refresh token endpoint
export const refreshAccessToken = async ({ refresh_token }) => {
  if (!refresh_token) {
    return { statusCode: 400, body: { message: "Refresh token required" } };
  }

  const result = await sql.query(
    `SELECT * FROM refresh_tokens WHERE token = $1`,
    [refresh_token],
  );

  if (result.rows.length === 0) {
    return { statusCode: 403, body: { message: "Invalid refresh token" } };
  }

  const userResult = await sql.query(
    `SELECT * FROM users WHERE id = $1`,
    [result.rows[0].user_id],
  );

  const user = userResult.rows[0];

  const newAccessToken = jwt.sign(
    { id: user.id, mobile: user.mobile },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Access token refreshed successfully",
      access_token: newAccessToken,
      expires_in: process.env.JWT_EXPIRES_IN || "15m",
    },
  };
};

// logout
export const logout = async ({ refresh_token }) => {
  if (!refresh_token) {
    return { statusCode: 400, body: { message: "Refresh token required" } };
  }

  await sql.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [refresh_token],
  );

  return {
    statusCode: 200,
    body: { success: true, message: "Logged out successfully" },
  };
};

