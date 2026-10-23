import {
  createClothesWeightTier,
  deleteClothesWeightTier,
  getClothesWeightTierById,
  listClothesWeightTiers,
  updateClothesWeightTier,
} from "../../services/admin/adminClothesWeightTier.service.js";

const toResponse = (row) => ({
  id: row.id,
  min_clothes: Number(row.min_clothes),
  max_clothes: Number(row.max_clothes),
  min_kg: Number(row.min_kg),
  max_kg: Number(row.max_kg),
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

export const getClothesWeightTierList = async (req, res, next) => {
  try {
    const rows = await listClothesWeightTiers();
    return res.status(200).json({
      success: true,
      message: "Clothes weight tiers retrieved successfully",
      data: rows.map(toResponse),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getClothesWeightTierItem = async (req, res, next) => {
  try {
    const row = await getClothesWeightTierById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Clothes weight tier retrieved successfully",
      data: toResponse(row),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const addClothesWeightTier = async (req, res, next) => {
  try {
    const data = await createClothesWeightTier(req.body);
    return res.status(201).json({
      success: true,
      message: "Clothes weight tier added successfully",
      data: toResponse(data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const updateClothesWeightTierById = async (req, res, next) => {
  try {
    const data = await updateClothesWeightTier(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Clothes weight tier updated successfully",
      data: toResponse(data),
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const deleteClothesWeightTierById = async (req, res, next) => {
  try {
    await deleteClothesWeightTier(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Clothes weight tier deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
