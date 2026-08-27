import {
  createFaq,
  deleteFaq,
  getFaqById,
  listFaqs,
  updateFaq,
} from "../../services/admin/adminFaq.service.js";

const toResponse = (row) => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
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

export const getFaqList = async (req, res, next) => {
  try {
    const rows = await listFaqs();
    return res.status(200).json({
      success: true,
      message: "FAQs retrieved successfully",
      data: rows.map(toResponse),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getFaqItem = async (req, res, next) => {
  try {
    const row = await getFaqById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "FAQ retrieved successfully",
      data: toResponse(row),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addFaq = async (req, res, next) => {
  try {
    const data = await createFaq(req.body);
    return res.status(201).json({
      success: true,
      message: "FAQ added successfully",
      data: toResponse(data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateFaqById = async (req, res, next) => {
  try {
    const data = await updateFaq(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "FAQ updated successfully",
      data: toResponse(data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteFaqById = async (req, res, next) => {
  try {
    await deleteFaq(req.params.id);
    return res.status(200).json({
      success: true,
      message: "FAQ deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
