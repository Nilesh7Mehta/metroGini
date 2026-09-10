import {
  createTermsConsent,
  createTermsSection,
  deleteTermsConsent,
  deleteTermsSection,
  getAdminTermsAndConditions,
  updateAdminTermsPage,
  updateTermsConsent,
  updateTermsSection,
} from "../../services/admin/adminTermsAndConditions.service.js";

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const getAdminTerms = async (req, res, next) => {
  try {
    const data = await getAdminTermsAndConditions();
    return res.status(200).json({
      success: true,
      message: "Terms and conditions retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateAdminTerms = async (req, res, next) => {
  try {
    const data = await updateAdminTermsPage(req.body);
    return res.status(200).json({
      success: true,
      message: "Terms and conditions updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addTermsSection = async (req, res, next) => {
  try {
    const data = await createTermsSection(req.body);
    return res.status(201).json({
      success: true,
      message: "Terms section added successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateTermsSectionById = async (req, res, next) => {
  try {
    const data = await updateTermsSection(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Terms section updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteTermsSectionById = async (req, res, next) => {
  try {
    await deleteTermsSection(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Terms section deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addTermsConsent = async (req, res, next) => {
  try {
    const data = await createTermsConsent(req.body);
    return res.status(201).json({
      success: true,
      message: "Terms consent added successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateTermsConsentById = async (req, res, next) => {
  try {
    const data = await updateTermsConsent(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Terms consent updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteTermsConsentById = async (req, res, next) => {
  try {
    await deleteTermsConsent(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Terms consent deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
