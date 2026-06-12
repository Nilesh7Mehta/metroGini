import {
  createPincode,
  getPincodes,
  getPincodeById,
  updatePincode,
  deletePincode,
} from "../../services/common/pincode.service.js";

const handleError = (res, err, next) => {
  if (err.code === "23505") {
    return res.status(400).json({
      success: false,
      message: "pincode already exists",
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

export const addPincode = async (req, res, next) => {
  try {
    const data = await createPincode(req.body);
    return res.status(201).json({
      success: true,
      message: "Pincode created successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const listPincodes = async (req, res, next) => {
  try {
    const data = await getPincodes(req.query);
    return res.status(200).json({
      success: true,
      message: "Pincodes retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const getPincode = async (req, res, next) => {
  try {
    const data = await getPincodeById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Pincode retrieved successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const editPincode = async (req, res, next) => {
  try {
    const data = await updatePincode(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Pincode updated successfully",
      data,
    });
  } catch (err) {
    handleError(res, err, next);
  }
};

export const removePincode = async (req, res, next) => {
  try {
    await deletePincode(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Pincode deleted successfully",
    });
  } catch (err) {
    handleError(res, err, next);
  }
};
