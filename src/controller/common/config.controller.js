import { getCommonConfig, updateConfigById } from "../../services/common/config.service.js";

export const getConfig = async (req, res, next) => {
  try {
    const data = await getCommonConfig();
    return res.status(200).json({
      success: true,
      message: "Config retrieved successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateConfig = async (req, res, next) => {
  try {
    const data = await updateConfigById(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: "Config updated successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
