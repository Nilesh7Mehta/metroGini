import {
  adminLogin,
  getAdminProfile,
  changeAdminPassword,
  insertCoupon,
  editCoupon,
  getAllCoupons,
  getCoupon,
} from "../../services/admin/admin.service.js";

export const loginAdmin = async (req, res, next) => {
  try {
    const result = await adminLogin(req.body.email, req.body.password);
    return res
      .status(200)
      .json({
        success: true,
        message: "Admin logged in successfully",
        ...result,
      });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const data = await getAdminProfile(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    await changeAdminPassword(req.user.id, req.body);
    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const createCoupon = async (req, res, next) => {
  try {
    const data = await insertCoupon(req.body);
    return res
      .status(200)
      .json({ message: "Coupon created successfully", data });
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ message: "Coupon code already exists" });
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const data = await editCoupon(req.params.id, req.body);
    return res
      .status(200)
      .json({ message: "Coupon updated successfully", data });
  } catch (err) {
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

export const getCoupons = async (req, res, next) => {
  try {
    const data = await getAllCoupons();
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getCouponById = async (req, res, next) => {
  try {
    const data = await getCoupon(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Coupon retrieved successfully", data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};
