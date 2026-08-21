import {
  upsertBanner,
  editBanner,
  removeBanner,
  fetchBanners,
} from "../../services/admin/banner.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";

const toBannerResponse = (req, row) => ({
  id: row.id,
  image: getImageUrl(req, row.image_url),
  couponCode: row.coupon_code || null,
});

export const addBanner = async (req, res, next) => {
  try {
    const { data, created } = await upsertBanner(req.body, req.file?.path);
    return res.status(created ? 201 : 200).json({
      success: true,
      message: created
        ? "Banner added successfully"
        : "Banner updated successfully",
      data: toBannerResponse(req, data),
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
    return res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: toBannerResponse(req, data),
    });
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
    const data = rows.map((row) => ({
      image: getImageUrl(req, row.image_url),
      couponCode: row.coupon_code || null,
    }));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
