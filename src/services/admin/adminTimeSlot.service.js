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

const getTimeSlotById = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM time_slots WHERE id = $1`, [id]);

  if (rows.length === 0) {
    throw { status: 404, message: 'Time slot not found' };
  }

  return rows[0];
};

export const getTimeSlots = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM time_slots ORDER BY start_time ASC, id ASC`,
  );

  return rows;
};

export const createTimeSlot = async (body) => {
  const { start_time, end_time, is_peak, peak_extra_charge, is_active } = body;

  const { rows } = await sql.query(
    `
    INSERT INTO time_slots
      (start_time, end_time, is_peak, peak_extra_charge, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [
      normalizeTime(start_time, 'start_time'),
      normalizeTime(end_time, 'end_time'),
      parseBoolean(is_peak, false),
      peak_extra_charge !== undefined ? Number(peak_extra_charge) : 0,
      parseBoolean(is_active, true),
    ],
  );

  return rows[0];
};

export const updateTimeSlot = async (id, body) => {
  const existing = await getTimeSlotById(id);
  const { start_time, end_time, is_peak, peak_extra_charge, is_active } = body;

  const { rows } = await sql.query(
    `
    UPDATE time_slots
    SET start_time = $1,
        end_time = $2,
        is_peak = $3,
        peak_extra_charge = $4,
        is_active = $5,
        updated_at = NOW()
    WHERE id = $6
    RETURNING *
    `,
    [
      start_time !== undefined
        ? normalizeTime(start_time, 'start_time')
        : existing.start_time,
      end_time !== undefined
        ? normalizeTime(end_time, 'end_time')
        : existing.end_time,
      is_peak !== undefined ? parseBoolean(is_peak, existing.is_peak) : existing.is_peak,
      peak_extra_charge !== undefined
        ? Number(peak_extra_charge)
        : existing.peak_extra_charge,
      is_active !== undefined ? parseBoolean(is_active, existing.is_active) : existing.is_active,
      id,
    ],
  );

  return rows[0];
};
