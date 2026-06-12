import {
  createPincodeGroup,
  getPincodeGroups,
  getPincodeGroupById,
  updatePincodeGroup,
  deletePincodeGroup,
} from "../../services/common/pincodeGroup.service.js";

const handleError = (res, err, next) => {
  if (err.code === "23505") {
    return res.status(400).json({
      success: false,
      message: "group_code already exists",
    });
  }
  if (err.status) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
    });
  }
  next(err);
};

export const addPincodeGroup = async (req, res, next) => {
  try {
    const data = await createPincodeGroup(req.body);
    return res.status(201).json({
      success: true,
      message: "Pincode group created successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const listPincodeGroups = async (req, res, next) => {
  try {
    const data = await getPincodeGroups(req.query);
    return res.status(200).json({
      success: true,
      message: "Pincode groups retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getPincodeGroup = async (req, res, next) => {
  try {
    const data = await getPincodeGroupById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Pincode group retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const editPincodeGroup = async (req, res, next) => {
  try {
    const data = await updatePincodeGroup(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Pincode group updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const removePincodeGroup = async (req, res, next) => {
  try {
    await deletePincodeGroup(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Pincode group deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
