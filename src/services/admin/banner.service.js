import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";

export const upsertBanner = async (body, imagePath) => {
  const { heading, subheading, description, status, banner_id } = body;

  if (!imagePath) throw { status: 400, message: "Banner image is required" };

  if (banner_id) {
    const { rows: existing } = await sql.query(
      `SELECT image_url FROM banners WHERE id = $1`,
      [banner_id],
    );
    const oldImage = existing[0]?.image_url;

    const { rows } = await sql.query(
      `UPDATE banners SET image_url=$1, heading=$2, subheading=$3, description=$4, status=$5 WHERE id=$6 RETURNING *`,
      [imagePath, heading, subheading, description, status, banner_id],
    );

    if (oldImage) await deleteFile(oldImage);
    return { data: rows[0], created: false };
  }

  const { rows } = await sql.query(
    `INSERT INTO banners (image_url, heading, subheading, description, status) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [imagePath, heading, subheading, description, status ?? true],
  );
  return { data: rows[0], created: true };
};

export const editBanner = async (id, body, newImagePath) => {
  const { heading, subheading, description, status } = body;

  const { rows } = await sql.query(
    `SELECT image_url FROM banners WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw { status: 404, message: "Banner not found" };

  let imagePath = rows[0].image_url;
  if (newImagePath) {
    await deleteFile(imagePath);
    imagePath = newImagePath;
  }

  const { rows: updated } = await sql.query(
    `UPDATE banners SET image_url=$1, heading=$2, subheading=$3, description=$4, status=$5 WHERE id=$6 RETURNING *`,
    [imagePath, heading, subheading, description || null, status, id],
  );
  return updated[0];
};

export const removeBanner = async (id) => {
  const { rows } = await sql.query(
    `SELECT image_url FROM banners WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw { status: 404, message: "Banner not found" };

  await deleteFile(rows[0].image_url);
  await sql.query(`DELETE FROM banners WHERE id = $1`, [id]);
};

export const fetchBanners = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM banners WHERE status = true ORDER BY created_at DESC`,
  );
  return rows;
};
