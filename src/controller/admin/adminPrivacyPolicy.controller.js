import {
  createPrivacySection,
  deletePrivacySection,
  getAdminPrivacyPolicy,
  updateAdminPrivacyPage,
  updatePrivacySection,
} from "../../services/admin/adminPrivacyPolicy.service.js";

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const getAdminPrivacy = async (req, res, next) => {
  try {
    const data = await getAdminPrivacyPolicy();
    return res.status(200).json({
      success: true,
      message: "Privacy policy retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateAdminPrivacy = async (req, res, next) => {
  try {
    const data = await updateAdminPrivacyPage(req.body);
    return res.status(200).json({
      success: true,
      message: "Privacy policy updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addPrivacySection = async (req, res, next) => {
  try {
    const data = await createPrivacySection(req.body);
    return res.status(201).json({
      success: true,
      message: "Privacy policy section added successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updatePrivacySectionById = async (req, res, next) => {
  try {
    const data = await updatePrivacySection(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Privacy policy section updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deletePrivacySectionById = async (req, res, next) => {
  try {
    await deletePrivacySection(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Privacy policy section deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
