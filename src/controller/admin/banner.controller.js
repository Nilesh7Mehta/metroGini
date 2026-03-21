import {
  upsertBanner,
  editBanner,
  removeBanner,
  fetchBanners,
} from "../../services/admin/banner.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";

export const addBanner = async (req, res, next) => {
  try {
    const { data, created } = await upsertBanner(req.body, req.file?.path);
    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? "Banner added successfully"
        : "Banner updated successfully",
      data,
    });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const updateBanner = async (req, res, next) => {
  try {
    const data = await editBanner(req.params.id, req.body, req.file?.path);
    return res
      .status(200)
      .json({ success: true, message: "Banner updated successfully", data });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const deleteBanner = async (req, res, next) => {
  try {
    await removeBanner(req.params.id);
    return res
      .status(200)
      .json({ success: true, message: "Banner deleted successfully" });
  } catch (err) {
    if (err.status)
      return res
        .status(err.status)
        .json({ success: false, message: err.message });
    next(err);
  }
};

export const getBanners = async (req, res, next) => {
  try {
    const rows = await fetchBanners();
    const data = rows.map((b) => ({
      ...b,
      image_url: getImageUrl(req, b.image_url),
    }));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
