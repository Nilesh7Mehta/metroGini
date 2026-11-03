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

/** Rider tokens are signed with `rider_id` (see rider.service). */
export const isRider = (req, res, next) => {
  if (!req.user?.rider_id) {
    return res.status(403).json({
      success: false,
      message: "Invalid access",
    });
  }

  next();
};

/** Vendor tokens are signed with `vendor_id` (see vendor.service). */
export const isVendor = (req, res, next) => {
  if (!req.user?.vendor_id) {
    return res.status(403).json({
      success: false,
      message: "Invalid access",
    });
  }

  next();
};
