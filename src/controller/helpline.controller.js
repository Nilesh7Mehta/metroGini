import {
  resolveHelplineIdentity,
  submitNeedHelp,
  submitNeedHelpFromRequest,
} from "../services/common/helpline.service.js";

export const needHelp = async (req, res, next) => {
  try {
    const data = await submitNeedHelpFromRequest(req, req.body);
    return res.status(200).json({
      success: true,
      message: "Support request submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/** Legacy user route — type fixed to user */
export const needHelpAsUser = async (req, res, next) => {
  try {
    const { message, report_issue } = req.body;
    const { identityId } = resolveHelplineIdentity(req, "user");
    const data = await submitNeedHelp({
      type: "user",
      identityId,
      message,
      report_issue,
    });
    return res.status(200).json({
      success: true,
      message: "Support request submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/** Legacy rider route — type fixed to rider */
export const needHelpAsRider = async (req, res, next) => {
  try {
    const { report_issue, message } = req.body;
    const { identityId } = resolveHelplineIdentity(req, "rider");
    const data = await submitNeedHelp({
      type: "rider",
      identityId,
      message,
      report_issue,
    });
    return res.status(200).json({
      success: true,
      message: "Support request submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

/** Vendor convenience route — type fixed to vendor */
export const needHelpAsVendor = async (req, res, next) => {
  try {
    const { message, report_issue } = req.body;
    const { identityId } = resolveHelplineIdentity(req, "vendor");
    const data = await submitNeedHelp({
      type: "vendor",
      identityId,
      message,
      report_issue,
    });
    return res.status(200).json({
      success: true,
      message: "Support request submitted successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
