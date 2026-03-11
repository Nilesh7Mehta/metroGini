
import { deleteFile } from "../../utils/file.service.js";
import sql from "../../config/db.js";
import { getImageUrl } from "../../utils/getImageUrl.js";
 
export const addBanner = async (req, res, next) => {
  try {
    const { heading, subheading, description, status, banner_id } = req.body;
    const image = req.file ? req.file.path : null;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Banner image is required"
      });
    }

    let oldImage = null;

    // If updating existing banner
    if (banner_id) {
      const { rows } = await sql.query(
        `SELECT image_url FROM banners WHERE id = $1`,
        [banner_id]
      );

      if (rows.length > 0) {
        oldImage = rows[0].image_url;
      }

      const { rows: updated } = await sql.query(
        `UPDATE banners
         SET image_url = $1,
             heading = $2,
             subheading = $3,
             description = $4,
             status = $5
         WHERE id = $6
         RETURNING *`,
        [image, heading, subheading, description, status, banner_id]
      );

      if (oldImage) {
        await deleteFile(oldImage);
      }

      return res.status(200).json({
        success: true,
        message: "Banner updated successfully",
        data: updated[0]
      });
    }

    // Create new banner
    const { rows } = await sql.query(
      `INSERT INTO banners (image_url, heading, subheading, description, status)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [image, heading, subheading, description, status ?? true]
    );

    res.status(201).json({
      success: true,
      message: "Banner added successfully",
      data: rows[0]
    });

  } catch (error) {
    next(error);
  }
};

export const updateBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { heading, subheading, description, status } = req.body;
    const newImage = req.file?.path;

    const { rows } = await sql.query(
      `SELECT image_url FROM banners WHERE id = $1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Banner not found"
      });
    }

    let imagePath = rows[0].image_url;

    if (newImage) {
      await deleteFile(imagePath);
      imagePath = newImage;
    }

    const { rows: updated } = await sql.query(
      `UPDATE banners
       SET image_url=$1,
           heading=$2,
           subheading=$3,
           description=$4,
           status=$5
       WHERE id=$6
       RETURNING *`,
      [imagePath, heading, subheading, description || null, status, id]
    );

    res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: updated[0]
    });

  } catch (error) {
    next(error);
  }
};

export const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await sql.query(
      `SELECT image_url FROM banners WHERE id=$1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Banner not found"
      });
    }

    await deleteFile(rows[0].image_url);

    await sql.query(
      `DELETE FROM banners WHERE id=$1`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: "Banner deleted successfully"
    });

  } catch (error) {
    next(error);
  }
};

export const getBanners = async (req, res, next) => {
  try {

    const { rows } = await sql.query(
      `SELECT * FROM banners WHERE status = true ORDER BY created_at DESC`
    );

    const banners = rows.map(banner => ({
      ...banner,
      image_url: getImageUrl(req, banner.image_url)
    }));

    res.status(200).json({
      success: true,
      data: banners
    });

  } catch (error) {
    next(error);
  }
};