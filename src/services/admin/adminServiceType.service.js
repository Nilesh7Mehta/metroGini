import sql from '../../config/db.js';

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const getServiceTypeById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM service_types WHERE id = $1`,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: 'Service type not found' };
  }

  return rows[0];
};

export const createServiceType = async (body) => {
  const { service_id, name, extra_price_per_kg, flat_fee, delivery_hours, is_active } = body;

  if (!service_id) {
    throw { status: 400, message: 'service_id is required' };
  }
  if (!name?.trim()) {
    throw { status: 400, message: 'name is required' };
  }

  const { rows: serviceRows } = await sql.query(
    `SELECT id FROM services WHERE id = $1`,
    [service_id],
  );
  if (serviceRows.length === 0) {
    throw { status: 404, message: 'Service not found' };
  }

  const { rows } = await sql.query(
    `
    INSERT INTO service_types
      (service_id, name, extra_price_per_kg, flat_fee, delivery_hours, is_active)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      Number(service_id),
      name.trim(),
      extra_price_per_kg !== undefined ? Number(extra_price_per_kg) : 0,
      flat_fee !== undefined ? Number(flat_fee) : 0,
      delivery_hours !== undefined ? parseInt(delivery_hours, 10) : null,
      parseBoolean(is_active, true),
    ],
  );

  return rows[0];
};

export const updateServiceType = async (id, body) => {
  const existing = await getServiceTypeById(id);
  const { service_id, name, extra_price_per_kg, flat_fee, delivery_hours, is_active } = body;

  if (service_id !== undefined) {
    const { rows: serviceRows } = await sql.query(
      `SELECT id FROM services WHERE id = $1`,
      [service_id],
    );
    if (serviceRows.length === 0) {
      throw { status: 404, message: 'Service not found' };
    }
  }

  const { rows } = await sql.query(
    `
    UPDATE service_types
    SET service_id = $1,
        name = $2,
        extra_price_per_kg = $3,
        flat_fee = $4,
        delivery_hours = $5,
        is_active = $6
    WHERE id = $7
    RETURNING *
    `,
    [
      service_id !== undefined ? Number(service_id) : existing.service_id,
      name?.trim() || existing.name,
      extra_price_per_kg !== undefined ? Number(extra_price_per_kg) : existing.extra_price_per_kg,
      flat_fee !== undefined ? Number(flat_fee) : existing.flat_fee,
      delivery_hours !== undefined ? parseInt(delivery_hours, 10) : existing.delivery_hours,
      is_active !== undefined ? parseBoolean(is_active, existing.is_active) : existing.is_active,
      id,
    ],
  );

  return rows[0];
};
