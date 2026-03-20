import {
  loginOrVerifyService,
  verifyOtpService,
  chooseShiftService,
  goActiveService,
  acceptTermsService,
  updateProfileService,
  getProfileService,
  needHelpService,
} from "../../services/rider/rider.service.js";

export const loginOrVerify = async (req, res, next) => {
  try {
    const data = await loginOrVerifyService(req.body.mobile_number);
    res.json({ success: true, message: "OTP sent successfully", data });
  } catch (error) {
    next(error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { mobile_number, otp } = req.body;
    if (!mobile_number || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }
    const data = await verifyOtpService(mobile_number, otp);
    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully", ...data });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const chooseShift = async (req, res, next) => {
  try {
    const { shift_id } = req.body;
    if (!shift_id)
      return res
        .status(400)
        .json({ success: false, message: "Shift is required" });
    const shiftName = await chooseShiftService(req.user.rider_id, shift_id);
    res.status(200).json({
      success: true,
      message: `Shift confirmed! You have selected ${shiftName}`,
    });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const goActive = async (req, res, next) => {
  try {
    const isOnline = await goActiveService(req.user.rider_id);
    res.status(200).json({
      success: true,
      message: isOnline ? "Rider is now online" : "Rider is now offline",
    });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const acceptTerms = async (req, res, next) => {
  try {
    const is_terms_and_condition_verified = await acceptTermsService(
      req.user.rider_id,
    );
    res.status(200).json({
      success: true,
      message: "Terms and Conditions accepted successfully",
      is_terms_and_condition_verified,
    });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    if (!req.user.rider_id)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    await updateProfileService(req.user.rider_id, req.body, req.file);
    res
      .status(200)
      .json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    if (!req.user.rider_id)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const data = await getProfileService(req.user.rider_id, req);
    res
      .status(200)
      .json({ success: true, message: "Profile fetched successfully", data });
  } catch (error) {
    if (error.status)
      return res
        .status(error.status)
        .json({ success: false, message: error.message });
    next(error);
  }
};

export const needHelp = async (req, res, next) => {
  try {
    const { report_issue, message } = req.body;
    if (!report_issue)
      return res.status(400).json({ message: "Report issue is required" });
    if (!message)
      return res.status(400).json({ message: "Message field is required" });
    const data = await needHelpService(
      req.user.rider_id,
      report_issue,
      message,
    );
    res.status(200).json({
      status: true,
      message: "Support request submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
