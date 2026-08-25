import {
  createKnowAboutUs,
  deleteKnowAboutUs,
  getKnowAboutUsById,
  listKnowAboutUs,
  updateKnowAboutUs,
} from "../../services/admin/adminKnowAboutUs.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";

const toResponse = (req, row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  image: getImageUrl(req, row.image),
  status: row.status,
  sequence: row.sequence,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const getKnowAboutUsList = async (req, res, next) => {
  try {
    const rows = await listKnowAboutUs();
    return res.status(200).json({
      success: true,
      message: "Know about us items retrieved successfully",
      data: rows.map((row) => toResponse(req, row)),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getKnowAboutUsItem = async (req, res, next) => {
  try {
    const row = await getKnowAboutUsById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Know about us item retrieved successfully",
      data: toResponse(req, row),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addKnowAboutUs = async (req, res, next) => {
  try {
    const data = await createKnowAboutUs(req.body, req.file?.path);
    return res.status(201).json({
      success: true,
      message: "Know about us item added successfully",
      data: toResponse(req, data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateKnowAboutUsById = async (req, res, next) => {
  try {
    const data = await updateKnowAboutUs(
      req.params.id,
      req.body,
      req.file?.path,
    );
    return res.status(200).json({
      success: true,
      message: "Know about us item updated successfully",
      data: toResponse(req, data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteKnowAboutUsById = async (req, res, next) => {
  try {
    await deleteKnowAboutUs(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Know about us item deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
