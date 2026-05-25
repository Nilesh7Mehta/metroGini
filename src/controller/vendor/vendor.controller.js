import {
  acceptTermsService,
  loginOrVerifyVendorService,
  loginVendorService,
  registerVendorService,
  toggleVendorActiveService,
  verifyVendorOtp,
} from "../../services/vendor/vendor.service.js";
import {
  getVendorProfileService,
  updateVendorProfileService,
} from "../../services/vendor/vendorProfile.service.js";

export const register = async (req, res, next) => {
  try {
    const vendor = await registerVendorService(req.body);
    return res.status(201).json({
      success: true,
      message: "Vendor registered successfully",
      data: vendor,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { access_token, expiresIn } = await loginVendorService(req.body);
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        access_token,
        expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const loginVerify = async (req, res, next) => {
  try {
    const { mobile_number } = req.body;
    const data = await loginOrVerifyVendorService(mobile_number);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { mobile_number, otp } = req.body;
    const data = await verifyVendorOtp(mobile_number, otp);
        res.json(data);
  } catch (error) {
        next(error);
    }
};

export const goActive = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;

    const isOnline = await toggleVendorActiveService(vendor_id);

    res.status(200).json({
      success: true,
      message: isOnline ? "Vendor is now online" : "Vendor is now offline",
    });
  } catch (error) {
    next(error);
  }
};

export const acceptTerms = async (req, res, next) => {
  try {
    const is_terms_and_condition_verified = await acceptTermsService(
      req.user.vendor_id,
    );
    res.status(200).json({
      success: true,
      message: "Terms and Conditions accepted successfully",
      is_terms_and_condition_verified,
    });
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const data = await getVendorProfileService(req.user.vendor_id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const data = await updateVendorProfileService(
      req.user.vendor_id,
      req.body,
    );
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
