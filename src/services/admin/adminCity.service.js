import sql from '../../config/db.js';
import { deleteFile } from '../../utils/file.service.js';

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const getCityById = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM cities WHERE id = $1`, [id]);

  if (rows.length === 0) {
    throw { status: 404, message: 'City not found' };
  }

  return rows[0];
};

export const createCity = async (body, imagePath) => {
  const { city_name, image, is_available } = body;

  if (!city_name?.trim()) {
    throw { status: 400, message: 'city_name is required' };
  }

  const resolvedImage = imagePath || image?.trim() || null;

  const { rows } = await sql.query(
    `
    INSERT INTO cities (city_name, image, is_available)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [city_name.trim(), resolvedImage, parseBoolean(is_available, true)],
  );

  return rows[0];
};

export const updateCity = async (id, body, imagePath) => {
  const existing = await getCityById(id);
  const { city_name, image, is_available } = body;

  let resolvedImage = existing.image;
  if (imagePath) {
    if (existing.image) {
      await deleteFile(existing.image);
    }
    resolvedImage = imagePath;
  } else if (image !== undefined) {
    resolvedImage = image?.trim() || null;
  }

  const { rows } = await sql.query(
    `
    UPDATE cities
    SET city_name = $1,
        image = $2,
        is_available = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
    `,
    [
      city_name?.trim() || existing.city_name,
      resolvedImage,
      is_available !== undefined
        ? parseBoolean(is_available, existing.is_available)
        : existing.is_available,
      id,
    ],
  );

  return rows[0];
};
