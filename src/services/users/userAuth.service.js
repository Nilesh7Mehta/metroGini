import sql from "../../config/db.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { findUserByMobile } from "../../models/user.model.js";
import { sendEmailSafe, sendOtpEmail } from "../common/email.service.js";
import { sendPushSafe } from "../common/push.service.js";
import { sendOtpSmsIfEnabled } from "../common/sms.service.js";
import { isSmsEnabled } from "../../config/sms.js";
import { SMS_TEMPLATE_KEYS } from "../../utils/smsTemplates.js";
import { accountOtpTemplate } from "../../utils/userNotificationTemplates.js";
import {
  resolveAuthOtpForMobile,
  isDummyAuthMobile,
  USER_OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  otpMatches,
  isOtpExpired,
  getOtpCooldownRemainingSeconds,
} from "../../utils/otp.js";
import { DEFAULT_USER_PROFILE_IMAGE } from "../../constants/userProfile.js";

const persistUserOtp = async (userId, otp) => {
  await sql.query(
    `UPDATE users
     SET otp = $2,
         otp_expires_at = NOW() + ($3::int * INTERVAL '1 minute'),
         otp_attempts = 0
     WHERE id = $1`,
    [userId, otp, USER_OTP_TTL_MINUTES],
  );
};

const deliverSecondaryOtpChannels = (user, otp) => {
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
};

const issueUserOtp = async (user, { successMessage, dummyMessage }) => {
  const remaining = getOtpCooldownRemainingSeconds(
    user.otp_expires_at,
    USER_OTP_TTL_MINUTES,
  );
  if (remaining > 0) {
    return {
      statusCode: 429,
      body: {
        success: false,
        message: `Please wait ${remaining} seconds before requesting another OTP`,
        retry_after_seconds: remaining,
      },
    };
  }

  const otp = resolveAuthOtpForMobile(user.mobile);
  const skipOtpDelivery = isDummyAuthMobile(user.mobile);

  if (!skipOtpDelivery) {
    try {
      await sendOtpSmsIfEnabled(
        SMS_TEMPLATE_KEYS.OTP_CREATE_ACCOUNT,
        user.mobile,
        { otp },
        { reference_type: "auth", reference_id: user.id },
      );
    } catch (error) {
      return {
        statusCode: error.status || 502,
        body: {
          success: false,
          message: "Unable to send OTP. Please try again.",
        },
      };
    }
  }

  await persistUserOtp(user.id, otp);

  if (!skipOtpDelivery) {
    deliverSecondaryOtpChannels(user, otp);
  }

  const includeOtp = !skipOtpDelivery && !isSmsEnabled();

  return {
    statusCode: 200,
    body: {
      success: true,
      message: skipOtpDelivery ? dummyMessage : successMessage,
      data: {
        id: user.id,
        mobile: user.mobile,
        ...(includeOtp ? { otp } : {}),
      },
    },
  };
};

// Check if user exists by mobile; if not create, then generate OTP and store it.
export const loginOrRegister = async ({ mobile }) => {
  if (!mobile) {
    return {
      statusCode: 400,
      body: { success: false, message: "Mobile is required" },
    };
  }

  let user = await findUserByMobile(mobile);
  let dummyMessage;
  let successMessage;

  if (!user) {
    const { rows } = await sql.query(
      `INSERT INTO users (mobile, profile_image) VALUES ($1, $2) RETURNING *`,
      [mobile, DEFAULT_USER_PROFILE_IMAGE],
    );
    user = rows[0];
    successMessage = "User registered successfully. OTP sent.";
    dummyMessage = "User registered successfully.";
  } else {
    if (!user.profile_image) {
      const { rows } = await sql.query(
        `UPDATE users
         SET profile_image = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [user.id, DEFAULT_USER_PROFILE_IMAGE],
      );
      user = rows[0] || user;
    }
    successMessage = "User found. OTP sent for login.";
    dummyMessage = "User found. Ready for login.";
  }

  const issued = await issueUserOtp(user, { successMessage, dummyMessage });
  if (issued.statusCode !== 200) return issued;

  issued.body.data.profile_image =
    user.profile_image || DEFAULT_USER_PROFILE_IMAGE;
  issued.body.data.profile_completed = user.profile_completed;
  issued.body.data.terms_and_condition = Boolean(user.terms_and_condition);
  return issued;
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

  return issueUserOtp(user, {
    successMessage: "OTP resent successfully",
    dummyMessage: "OTP ready. Use 1234 to verify.",
  });
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

  if (!user.otp) {
    return {
      statusCode: 400,
      body: { success: false, message: "OTP not generated. Please request a new OTP." },
    };
  }

  if (Number(user.otp_attempts) >= OTP_MAX_ATTEMPTS) {
    return {
      statusCode: 429,
      body: {
        success: false,
        message: "Too many incorrect attempts. Request a new OTP.",
      },
    };
  }

  if (isOtpExpired(user.otp_expires_at)) {
    return {
      statusCode: 400,
      body: { success: false, message: "OTP expired. Please request a new OTP." },
    };
  }

  if (!otpMatches(user.otp, otp)) {
    const { rows } = await sql.query(
      `UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1 RETURNING otp_attempts`,
      [user.id],
    );
    const attempts = Number(rows[0]?.otp_attempts || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      return {
        statusCode: 429,
        body: {
          success: false,
          message: "Too many incorrect attempts. Request a new OTP.",
        },
      };
    }
    return {
      statusCode: 400,
      body: { success: false, message: "Invalid OTP" },
    };
  }

  await sql.query(
    `UPDATE users
     SET terms_and_condition = TRUE,
         is_mobile_verified = TRUE,
         otp = NULL,
         otp_expires_at = NULL,
         otp_attempts = 0
     WHERE id = $1`,
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
