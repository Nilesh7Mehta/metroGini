import sql from '../../config/db.js';

const DAY_LABELS = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

const formatShiftScheduleRow = (row) => ({
  id: row.id,
  pincode_group_id: row.pincode_group_id,
  group_code: row.group_code,
  group_name: row.group_name,
  city_id: row.city_id != null ? Number(row.city_id) : null,
  day_of_week: row.day_of_week,
  day_label: DAY_LABELS[row.day_of_week] || null,
  shift_id: row.shift_id,
  shift_name: row.shift_name,
  start_time: row.start_time,
  end_time: row.end_time,
});

const normalizeRiderScheduleInput = (entries, { allowEmpty = false } = {}) => {
  if (entries === undefined || entries === null) return null;

  if (!Array.isArray(entries)) {
    throw { status: 400, message: 'rider_schedule must be an array' };
  }

  if (!entries.length) {
    if (allowEmpty) return [];
    throw { status: 400, message: 'rider_schedule must contain at least one entry' };
  }

  const seen = new Set();
  return entries.map((entry, index) => {
    const pincodeGroupId = Number(entry.pincode_group_id);
    const dayOfWeek = Number(entry.day_of_week);
    const shiftId = Number(entry.shift_id);

    if (!Number.isInteger(pincodeGroupId) || pincodeGroupId <= 0) {
      throw {
        status: 400,
        message: `rider_schedule[${index}].pincode_group_id must be a positive integer`,
      };
    }

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      throw {
        status: 400,
        message: `rider_schedule[${index}].day_of_week must be between 1 (Monday) and 7 (Sunday)`,
      };
    }

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
      throw {
        status: 400,
        message: `rider_schedule[${index}].shift_id must be a positive integer`,
      };
    }

    const key = `${pincodeGroupId}:${dayOfWeek}:${shiftId}`;
    if (seen.has(key)) {
      throw {
        status: 400,
        message: 'rider_schedule contains duplicate pincode_group_id, day_of_week, and shift_id entries',
      };
    }
    seen.add(key);

    return {
      pincode_group_id: pincodeGroupId,
      day_of_week: dayOfWeek,
      shift_id: shiftId,
    };
  });
};

const insertRiderScheduleRows = async (riderId, entries, client) => {
  for (const entry of entries) {
    await client.query(
      `INSERT INTO rider_group_shift_schedule
         (pincode_group_id, day_of_week, shift_id, rider_id)
       VALUES ($1, $2, $3, $4)`,
      [entry.pincode_group_id, entry.day_of_week, entry.shift_id, riderId],
    );
  }
};

export const getShiftSchedulesForRiders = async (riderIds = []) => {
  if (!riderIds.length) return new Map();

  const { rows } = await sql.query(
    `SELECT
       rgss.id,
       rgss.rider_id,
       rgss.pincode_group_id,
       pg.group_code,
       pg.name AS group_name,
       pg.city_id,
       rgss.day_of_week,
       rgss.shift_id,
       s.shift_name,
       s.start_time,
       s.end_time
     FROM rider_group_shift_schedule rgss
     JOIN pincode_groups pg ON pg.id = rgss.pincode_group_id
     JOIN shifts s ON s.id = rgss.shift_id
     WHERE rgss.rider_id = ANY($1::int[])
     ORDER BY rgss.id DESC`,
    [riderIds],
  );

  const scheduleMap = new Map();
  for (const row of rows) {
    const riderId = Number(row.rider_id);
    if (!scheduleMap.has(riderId)) {
      scheduleMap.set(riderId, []);
    }
    scheduleMap.get(riderId).push(formatShiftScheduleRow(row));
  }

  return scheduleMap;
};

export const getShiftScheduleForRider = async (riderId) => {
  const { rows } = await sql.query(
    `SELECT
       rgss.id,
       rgss.pincode_group_id,
       pg.group_code,
       pg.name AS group_name,
       pg.city_id,
       rgss.day_of_week,
       rgss.shift_id,
       s.shift_name,
       s.start_time,
       s.end_time
     FROM rider_group_shift_schedule rgss
     JOIN pincode_groups pg ON pg.id = rgss.pincode_group_id
     JOIN shifts s ON s.id = rgss.shift_id
     WHERE rgss.rider_id = $1
     ORDER BY rgss.id DESC`,
    [riderId],
  );

  return rows.map(formatShiftScheduleRow);
};

export const clearShiftScheduleForRider = async (riderId, client = sql) => {
  await client.query(
    `DELETE FROM rider_group_shift_schedule WHERE rider_id = $1`,
    [riderId],
  );
};

export const saveShiftScheduleForRider = async (
  riderId,
  entries,
  { client = sql, replace = false } = {},
) => {
  const normalized = normalizeRiderScheduleInput(entries, { allowEmpty: true });
  if (!normalized) return [];

  if (replace) {
    await clearShiftScheduleForRider(riderId, client);
  }

  if (!normalized.length) return [];

  await insertRiderScheduleRows(riderId, normalized, client);
  return normalized;
};

export const parseRiderScheduleFromBody = (body = {}) => {
  if (body.rider_schedule === undefined || body.rider_schedule === null) return null;
  return normalizeRiderScheduleInput(body.rider_schedule, { allowEmpty: true });
};

export const resolveRiderScheduleUpdate = (body = {}) => {
  if (body.rider_schedule === undefined) return null;

  const entries = normalizeRiderScheduleInput(body.rider_schedule, { allowEmpty: true });
  if (!entries.length) return { mode: 'clear' };
  return { mode: 'replace', entries };
};

export const mapRiderScheduleError = (err) => {
  if (err.code === '23505') {
    return {
      status: 400,
      message:
        'This pincode group, day, and shift combination is already assigned to another rider',
    };
  }

  if (err.code === '23503') {
    return {
      status: 400,
      message: 'Invalid pincode_group_id or shift_id in rider_schedule',
    };
  }

  return null;
};
