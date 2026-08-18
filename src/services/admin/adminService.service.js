import sql from '../../config/db.js';
import { deleteFile } from '../../utils/file.service.js';
import { seedZonePricesForService } from '../common/serviceZonePrice.service.js';

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const getServiceById = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM services WHERE id = $1`, [id]);

  if (rows.length === 0) {
    throw { status: 404, message: 'Service not found' };
  }

  return rows[0];
};

export const createService = async (body, imagePath) => {
  const { name, base_price_per_kg, image, is_active } = body;

  if (!name?.trim()) {
    throw { status: 400, message: 'name is required' };
  }

  if (base_price_per_kg === undefined || base_price_per_kg === null || base_price_per_kg === '') {
    throw { status: 400, message: 'base_price_per_kg is required' };
  }

  if (Number(base_price_per_kg) < 0) {
    throw { status: 400, message: 'base_price_per_kg must be a positive number' };
  }

  const resolvedImage = imagePath || image?.trim() || null;
  const price = Number(base_price_per_kg);

  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `
      INSERT INTO services (name, base_price_per_kg, image, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [name.trim(), price, resolvedImage, parseBoolean(is_active, true)],
    );
    await seedZonePricesForService(client, rows[0].id, price);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateService = async (id, body, imagePath) => {
  const existing = await getServiceById(id);
  const { name, base_price_per_kg, image, is_active } = body;

  if (base_price_per_kg !== undefined && Number(base_price_per_kg) < 0) {
    throw { status: 400, message: 'base_price_per_kg must be a positive number' };
  }

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
    UPDATE services
    SET name = $1,
        base_price_per_kg = $2,
        image = $3,
        is_active = $4,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
    `,
    [
      name?.trim() || existing.name,
      base_price_per_kg !== undefined ? Number(base_price_per_kg) : existing.base_price_per_kg,
      resolvedImage,
      is_active !== undefined ? parseBoolean(is_active, existing.is_active) : existing.is_active,
      id,
    ],
  );

  return rows[0];
};
