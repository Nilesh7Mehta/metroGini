import { acceptTermsService, loginOrVerifyVendorService, toggleVendorActiveService, verifyVendorOtp } from "../../services/vendor/vendor.service.js";

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
