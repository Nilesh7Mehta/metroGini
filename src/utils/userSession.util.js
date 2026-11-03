import jwt from "jsonwebtoken";
import crypto from "crypto";
import sql from "../config/db.js";

/**
 * Customer login sessions — one row in `refresh_tokens` per login.
 * The access token carries the session id (`sid`) and expires with the session,
 * so the user stays logged in for USER_SESSION_DAYS (default 7) unless they log out.
 */
const parseSessionDays = () => {
  const n = Number(process.env.USER_SESSION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : 7;
};

export const USER_SESSION_DAYS = parseSessionDays();
export const USER_SESSION_EXPIRES_IN = `${USER_SESSION_DAYS}d`;

export const signUserAccessToken = (user, sessionId, expiresIn = USER_SESSION_EXPIRES_IN) =>
  jwt.sign(
    {
      id: user.id,
      mobile: user.mobile,
      role: user.role || "user",
      sid: sessionId,
    },
    process.env.JWT_SECRET,
    { expiresIn },
  );

/** Start a new session for a customer and issue its tokens. */
export const createUserSession = async (user, db = sql) => {
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 day'))
     RETURNING id, expires_at`,
    [user.id, refreshToken, USER_SESSION_DAYS],
  );

  return {
    access_token: signUserAccessToken(user, rows[0].id),
    refresh_token: refreshToken,
    expires_in: USER_SESSION_EXPIRES_IN,
    session_expires_at: rows[0].expires_at,
  };
};
