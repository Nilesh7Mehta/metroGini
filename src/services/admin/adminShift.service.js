import sql from '../../config/db.js';

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
};

const normalizeTime = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    throw { status: 400, message: `${fieldName} is required` };
  }

  const normalized = String(value).trim();
  if (!TIME_PATTERN.test(normalized)) {
    throw { status: 400, message: `${fieldName} must be a valid time (HH:MM or HH:MM:SS)` };
  }

  return normalized.length === 5 ? `${normalized}:00` : normalized;
};

const getShiftById = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM shifts WHERE id = $1`, [id]);

  if (rows.length === 0) {
    throw { status: 404, message: 'Shift not found' };
  }

  return rows[0];
};

export const createShift = async (body) => {
  const { shift_name, start_time, end_time, status } = body;

  if (!shift_name?.trim()) {
    throw { status: 400, message: 'shift_name is required' };
  }

  const { rows } = await sql.query(
    `
    INSERT INTO shifts (shift_name, start_time, end_time, status)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [
      shift_name.trim(),
      normalizeTime(start_time, 'start_time'),
      normalizeTime(end_time, 'end_time'),
      parseBoolean(status, true),
    ],
  );

  return rows[0];
};

export const updateShift = async (id, body) => {
  const existing = await getShiftById(id);
  const { shift_name, start_time, end_time, status } = body;

  const { rows } = await sql.query(
    `
    UPDATE shifts
    SET shift_name = $1,
        start_time = $2,
        end_time = $3,
        status = $4
    WHERE id = $5
    RETURNING *
    `,
    [
      shift_name?.trim() || existing.shift_name,
      start_time !== undefined
        ? normalizeTime(start_time, 'start_time')
        : existing.start_time,
      end_time !== undefined
        ? normalizeTime(end_time, 'end_time')
        : existing.end_time,
      status !== undefined ? parseBoolean(status, existing.status) : existing.status,
      id,
    ],
  );

  return rows[0];
};
