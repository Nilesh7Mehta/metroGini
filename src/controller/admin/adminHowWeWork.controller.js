import {
  createHowWeWork,
  deleteHowWeWork,
  getHowWeWorkById,
  listHowWeWork,
  updateHowWeWork,
} from "../../services/admin/adminHowWeWork.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";

const toResponse = (req, row) => ({
  id: row.id,
  heading: row.heading,
  image: getImageUrl(req, row.image),
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const handleError = (res, err, next) => {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  next(err);
};

export const getHowWeWorkList = async (req, res, next) => {
  try {
    const rows = await listHowWeWork();
    return res.status(200).json({
      success: true,
      message: "How we work items retrieved successfully",
      data: rows.map((row) => toResponse(req, row)),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getHowWeWorkItem = async (req, res, next) => {
  try {
    const row = await getHowWeWorkById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "How we work item retrieved successfully",
      data: toResponse(req, row),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addHowWeWork = async (req, res, next) => {
  try {
    const data = await createHowWeWork(req.body, req.file?.path);
    return res.status(201).json({
      success: true,
      message: "How we work item added successfully",
      data: toResponse(req, data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateHowWeWorkById = async (req, res, next) => {
  try {
    const data = await updateHowWeWork(req.params.id, req.body, req.file?.path);
    return res.status(200).json({
      success: true,
      message: "How we work item updated successfully",
      data: toResponse(req, data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteHowWeWorkById = async (req, res, next) => {
  try {
    await deleteHowWeWork(req.params.id);
    return res.status(200).json({
      success: true,
      message: "How we work item deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
