import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import sql from "../config/db.js";

dotenv.config();

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access token missing or invalid format",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const isCustomerToken =
      decoded.id &&
      !decoded.rider_id &&
      !decoded.vendor_id &&
      (decoded.role == null || decoded.role === "user");

    if (isCustomerToken) {
      // Tokens with a session id (`sid`) are valid only while that login session
      // exists and hasn't expired — logout deletes the session.
      const sessionId = decoded.sid ?? null;
      const { rows } = await sql.query(
        `SELECT u.is_deleted,
                ($2::bigint IS NULL OR EXISTS (
                  SELECT 1 FROM refresh_tokens rt
                  WHERE rt.id = $2::bigint
                    AND rt.user_id = u.id
                    AND rt.expires_at > NOW()
                )) AS session_active
         FROM users u
         WHERE u.id = $1 AND u.role::text = 'user'`,
        [decoded.id, sessionId],
      );
      if (rows[0]?.is_deleted) {
        return res.status(403).json({
          success: false,
          message: "Account deleted",
        });
      }
      if (rows[0] && !rows[0].session_active) {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
    }

    next();
  } catch (error) {
    if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
    next(error);
  }
};
