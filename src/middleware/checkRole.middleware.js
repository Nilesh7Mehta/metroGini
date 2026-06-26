import { isAdminPanelRole } from "../utils/adminUser.util.js";

export const isAdmin = (req, res, next) => {
  if (!req.user || !isAdminPanelRole(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Invalid access",
    });
  }

  next();
};
export const isUser = (req, res, next) => {
  if (!req.user || req.user.role !== "user") {
    return res.status(403).json({
      success: false,
      message: "Invalid access",
    });
  }

  next();
};
