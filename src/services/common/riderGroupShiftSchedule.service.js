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

const getAvailableShiftNames = async (client, pincodeGroupId, dayOfWeek) => {
  const { rows } = await client.query(
    `SELECT s.shift_name
     FROM shifts s
     WHERE COALESCE(s.status, TRUE) IS TRUE
       AND NOT EXISTS (
         SELECT 1
         FROM rider_group_shift_schedule t
         WHERE t.pincode_group_id = $1
           AND t.day_of_week = $2
           AND t.shift_id = s.id
       )
     ORDER BY s.start_time ASC, s.id ASC`,
    [pincodeGroupId, dayOfWeek],
  );
  return rows.map((row) => row.shift_name).filter(Boolean);
};

const buildAvailabilityNote = (availableNames) => {
  if (availableNames.length) {
    return `Available shifts left: ${availableNames.join(', ')}`;
  }
  return 'No shifts are left for this day and pincode group';
};

const buildConflictMessage = async (conflicts, client, entityLabel) => {
  const byGroupDay = new Map();

  for (const conflict of conflicts) {
    const key = `${conflict.pincode_group_id}:${conflict.day_of_week}`;
    if (!byGroupDay.has(key)) {
      byGroupDay.set(key, {
        pincode_group_id: Number(conflict.pincode_group_id),
        group_name: conflict.group_name,
        day_of_week: Number(conflict.day_of_week),
        taken_shifts: [],
      });
    }
    byGroupDay
      .get(key)
      .taken_shifts.push(conflict.shift_name || `shift #${conflict.shift_id}`);
  }

  const parts = [];
  for (const item of byGroupDay.values()) {
    const availableNames = await getAvailableShiftNames(
      client,
      item.pincode_group_id,
      item.day_of_week,
    );
    const dayLabel = DAY_LABELS[item.day_of_week] || `Day ${item.day_of_week}`;
    const groupLabel = item.group_name || `group #${item.pincode_group_id}`;
    const taken = [...new Set(item.taken_shifts)].join(', ');
    parts.push(
      `${dayLabel} (${groupLabel}): ${taken} already assigned to another ${entityLabel}. ${buildAvailabilityNote(availableNames)}`,
    );
  }

  return parts.join(' ');
};

const assertShiftSlotsAvailable = async (entries, client) => {
  if (!entries.length) return;

  const { rows: conflicts } = await client.query(
    `SELECT
       t.pincode_group_id,
       pg.name AS group_name,
       t.day_of_week,
       t.shift_id,
       s.shift_name
     FROM rider_group_shift_schedule t
     JOIN pincode_groups pg ON pg.id = t.pincode_group_id
     JOIN shifts s ON s.id = t.shift_id
     WHERE EXISTS (
       SELECT 1
       FROM UNNEST($1::bigint[], $2::smallint[], $3::int[])
         AS req(pincode_group_id, day_of_week, shift_id)
       WHERE req.pincode_group_id = t.pincode_group_id
         AND req.day_of_week = t.day_of_week
         AND req.shift_id = t.shift_id
     )`,
    [
      entries.map((entry) => entry.pincode_group_id),
      entries.map((entry) => entry.day_of_week),
      entries.map((entry) => entry.shift_id),
    ],
  );

  if (!conflicts.length) return;

  throw {
    status: 400,
    message: await buildConflictMessage(conflicts, client, 'rider'),
  };
};

const parseUniqueConflictDetail = (detail) => {
  if (!detail) return null;
  const match = String(detail).match(
    /Key \(pincode_group_id, day_of_week, shift_id\)=\((\d+),\s*(\d+),\s*(\d+)\)/,
  );
  if (!match) return null;
  return {
    pincode_group_id: Number(match[1]),
    day_of_week: Number(match[2]),
    shift_id: Number(match[3]),
  };
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

  await assertShiftSlotsAvailable(normalized, client);
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

export const mapRiderScheduleError = async (err) => {
  if (err.code === '23505') {
    const isScheduleConstraint =
      err.constraint === 'uq_rgss_group_day_shift' ||
      Boolean(parseUniqueConflictDetail(err.detail));
    if (!isScheduleConstraint) return null;

    const parsed = parseUniqueConflictDetail(err.detail);
    if (parsed) {
      const { rows } = await sql.query(
        `SELECT pg.name AS group_name, s.shift_name
         FROM pincode_groups pg
         CROSS JOIN shifts s
         WHERE pg.id = $1 AND s.id = $2`,
        [parsed.pincode_group_id, parsed.shift_id],
      );
      const availableNames = await getAvailableShiftNames(
        sql,
        parsed.pincode_group_id,
        parsed.day_of_week,
      );
      const dayLabel = DAY_LABELS[parsed.day_of_week] || `Day ${parsed.day_of_week}`;
      const groupLabel = rows[0]?.group_name || `group #${parsed.pincode_group_id}`;
      const shiftLabel = rows[0]?.shift_name || `shift #${parsed.shift_id}`;
      return {
        status: 400,
        message: `${dayLabel} (${groupLabel}): ${shiftLabel} already assigned to another rider. ${buildAvailabilityNote(availableNames)}`,
      };
    }

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
