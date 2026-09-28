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
      const { rows } = await sql.query(
        `SELECT is_deleted FROM users WHERE id = $1 AND role::text = 'user'`,
        [decoded.id],
      );
      if (rows[0]?.is_deleted) {
        return res.status(403).json({
          success: false,
          message: "Account deleted",
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
