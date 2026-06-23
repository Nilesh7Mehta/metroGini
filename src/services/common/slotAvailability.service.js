import sql from '../../config/db.js';
import {
  SLOT_AVAILABILITY_DAYS,
  SLOT_AVAILABILITY_MAX_DAYS,
  DEFAULT_VENDOR_WASH_CAPACITY_KG,
} from '../../constants/slotAvailability.js';
import { DAY_LABELS } from './laundryGroupShiftSchedule.service.js';

const PINCODE_REGEX = /^\d{6}$/;

const formatDate = (date) => {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toLocaleDateString('en-CA');
};

const validatePincode = (value) => {
  const pincode = String(value || '').trim();
  if (!PINCODE_REGEX.test(pincode)) {
    throw { status: 400, message: 'pincode must be a valid 6-digit pincode' };
  }
  return pincode;
};

const validateDays = (value) => {
  if (value === undefined || value === null || value === '') {
    return SLOT_AVAILABILITY_DAYS;
  }

  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) {
    throw { status: 400, message: 'days must be a positive integer' };
  }

  if (days > SLOT_AVAILABILITY_MAX_DAYS) {
    throw {
      status: 400,
      message: `days cannot exceed ${SLOT_AVAILABILITY_MAX_DAYS}`,
    };
  }

  return days;
};

export const lookupPincode = async (pincode) => {
  const validatedPincode = validatePincode(pincode);

  const { rows } = await sql.query(
    `SELECT pincode, pincode_group_id, serviceable
     FROM pincodes
     WHERE pincode = $1`,
    [validatedPincode],
  );

  if (rows.length === 0) {
    throw { status: 404, message: 'Pincode not found' };
  }

  if (!rows[0].serviceable) {
    throw { status: 400, message: 'Pincode is not serviceable' };
  }

  return rows[0];
};

const validatePincodeGroupId = (value) => {
  const pincodeGroupId = Number(value);
  if (!Number.isInteger(pincodeGroupId) || pincodeGroupId < 1) {
    throw {
      status: 400,
      message: 'pincodeGroupId must be a positive integer',
    };
  }
  return pincodeGroupId;
};

export const reserveSlotCapacity = async (
  client,
  { laundryId, slotDate, shiftId },
) => {
  const capacityResult = await client.query(
    `SELECT FLOOR(COALESCE(max_wash_kg, $2))::int AS default_capacity
     FROM vendors
     WHERE id = $1`,
    [laundryId, DEFAULT_VENDOR_WASH_CAPACITY_KG],
  );

  if (capacityResult.rows.length === 0) {
    throw { status: 400, message: 'Vendor not found' };
  }

  const defaultCapacity = capacityResult.rows[0].default_capacity;

  const existing = await client.query(
    `SELECT id, total_capacity, used_capacity, status
     FROM laundry_slot_capacity
     WHERE laundry_id = $1
       AND slot_date = $2::date
       AND shift_id = $3
     FOR UPDATE`,
    [laundryId, slotDate, shiftId],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];

    if (row.status === 'CLOSED') {
      throw { status: 400, message: 'This slot is closed' };
    }

    if (row.used_capacity >= row.total_capacity) {
      throw {
        status: 400,
        message: 'This slot is fully booked. Please choose another date or shift.',
      };
    }

    await client.query(
      `UPDATE laundry_slot_capacity
       SET used_capacity = used_capacity + 1, updated_at = NOW()
       WHERE id = $1`,
      [row.id],
    );
    return;
  }

  if (defaultCapacity < 1) {
    throw {
      status: 400,
      message: 'This slot is fully booked. Please choose another date or shift.',
    };
  }

  await client.query(
    `INSERT INTO laundry_slot_capacity
       (laundry_id, slot_date, shift_id, total_capacity, used_capacity, status)
     VALUES ($1, $2::date, $3, $4, 1, 'OPEN')`,
    [laundryId, slotDate, shiftId, defaultCapacity],
  );
};

export const getSlotsAvailability = async ({ pincodeGroupId, days } = {}) => {
  const validatedPincodeGroupId = validatePincodeGroupId(pincodeGroupId);
  const validatedDays = validateDays(days);

  const { rows } = await sql.query(
    `
    WITH date_series AS (
      SELECT
        d::date AS slot_date,
        EXTRACT(ISODOW FROM d)::int AS day_of_week
      FROM generate_series(
        (CURRENT_DATE + INTERVAL '1 day')::date,
        (CURRENT_DATE + ($2::int * INTERVAL '1 day'))::date,
        INTERVAL '1 day'
      ) AS d
    ),
    active_shifts AS (
      SELECT id, shift_name
      FROM shifts
      WHERE status IS TRUE
    ),
    grid AS (
      SELECT
        ds.slot_date,
        ds.day_of_week,
        s.id AS shift_id,
        s.shift_name,
        lgss.laundry_id
      FROM date_series ds
      CROSS JOIN active_shifts s
      LEFT JOIN laundry_group_shift_schedule lgss
        ON lgss.pincode_group_id = $1
       AND lgss.day_of_week = ds.day_of_week
       AND lgss.shift_id = s.id
    )
    SELECT
      g.slot_date,
      g.day_of_week,
      g.shift_id,
      g.shift_name,
      g.laundry_id,
      lsc.total_capacity,
      lsc.used_capacity,
      lsc.status AS capacity_status,
      v.max_wash_kg,
      CASE
        WHEN g.laundry_id IS NULL THEN 0
        WHEN lsc.id IS NOT NULL THEN GREATEST(0, lsc.total_capacity - lsc.used_capacity)
        ELSE FLOOR(COALESCE(v.max_wash_kg, $3))
      END::int AS remaining,
      CASE
        WHEN g.laundry_id IS NULL THEN FALSE
        WHEN lsc.id IS NOT NULL THEN (
          lsc.status <> 'CLOSED'
          AND GREATEST(0, lsc.total_capacity - lsc.used_capacity) > 0
        )
        ELSE FLOOR(COALESCE(v.max_wash_kg, $3)) > 0
      END AS available
    FROM grid g
    LEFT JOIN laundry_slot_capacity lsc
      ON lsc.laundry_id = g.laundry_id
     AND lsc.slot_date = g.slot_date
     AND lsc.shift_id = g.shift_id
    LEFT JOIN vendors v ON v.id = g.laundry_id
    ORDER BY g.slot_date, g.shift_id
    `,
    [validatedPincodeGroupId, validatedDays, DEFAULT_VENDOR_WASH_CAPACITY_KG],
  );

  const daysMap = new Map();

  for (const row of rows) {
    const dateKey = formatDate(row.slot_date);

    if (!daysMap.has(dateKey)) {
      daysMap.set(dateKey, {
        date: dateKey,
        day: DAY_LABELS[row.day_of_week] || null,
        slots: [],
      });
    }

    daysMap.get(dateKey).slots.push({
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      available: Boolean(row.available),
      remaining: Number(row.remaining),
    });
  }

  return {
    pincodeGroupId: validatedPincodeGroupId,
    days: validatedDays,
    availability: Array.from(daysMap.values()),
  };
};
