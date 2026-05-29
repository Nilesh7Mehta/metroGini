import sql from '../../config/db.js';
import {
  PICKUP_SHIFT_SLOTS,
  PICKUP_SHIFT_CAPACITY,
  PICKUP_AVAILABILITY_DAYS,
  SHIFT_BY_PICKUP_SLOT,
} from '../../constants/pickupSlots.js';

const formatDate = (date) => {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toLocaleDateString('en-CA');
};

export const getPickupSlotBookedCount = async (
  pickup_date,
  pickup_slot_id,
  excludeOrderId = null,
) => {
  const params = [pickup_date, pickup_slot_id];
  let excludeClause = '';
  if (excludeOrderId != null) {
    params.push(excludeOrderId);
    excludeClause = ` AND id <> $${params.length}`;
  }

  const { rows } = await sql.query(
    `SELECT COUNT(*)::int AS booked_count
     FROM orders
     WHERE pickup_date = $1::date
       AND pickup_slot_id = $2
       AND status <> 'cancelled'
       AND pickup_date IS NOT NULL
       AND pickup_slot_id IS NOT NULL
       ${excludeClause}`,
    params,
  );

  return rows[0].booked_count;
};

export const assertPickupSlotAvailable = async (
  pickup_date,
  pickup_slot_id,
  excludeOrderId = null,
) => {
  if (!PICKUP_SHIFT_SLOTS.includes(Number(pickup_slot_id))) {
    throw { status: 400, message: 'Invalid pickup slot' };
  }

  const bookedCount = await getPickupSlotBookedCount(
    pickup_date,
    pickup_slot_id,
    excludeOrderId,
  );

  if (bookedCount >= PICKUP_SHIFT_CAPACITY) {
    throw {
      status: 400,
      message: 'This pickup slot is fully booked. Please choose another date or shift.',
    };
  }
};

export const getPickupAvailabilityCalendar = async () => {
  const daySpan = PICKUP_AVAILABILITY_DAYS - 1;

  const { rows } = await sql.query(
    `
    WITH date_series AS (
      SELECT generate_series(
        CURRENT_DATE,
        CURRENT_DATE + ($1::int * INTERVAL '1 day'),
        INTERVAL '1 day'
      )::date AS pickup_date
    ),
    pickup_slots AS (
      SELECT id, start_time, end_time, is_peak, peak_extra_charge
      FROM time_slots
      WHERE id = ANY($2::int[]) AND is_active = TRUE
    ),
    bookings AS (
      SELECT pickup_date, pickup_slot_id, COUNT(*)::int AS booked_count
      FROM orders
      WHERE pickup_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
        AND pickup_slot_id = ANY($2::int[])
        AND status <> 'cancelled'
        AND pickup_date IS NOT NULL
        AND pickup_slot_id IS NOT NULL
      GROUP BY pickup_date, pickup_slot_id
    )
    SELECT
      d.pickup_date,
      ts.id,
      ts.start_time,
      ts.end_time,
      ts.is_peak,
      ts.peak_extra_charge,
      COALESCE(b.booked_count, 0) AS booked_count
    FROM date_series d
    CROSS JOIN pickup_slots ts
    LEFT JOIN bookings b
      ON b.pickup_date = d.pickup_date AND b.pickup_slot_id = ts.id
    ORDER BY d.pickup_date, ts.id
    `,
    [daySpan, PICKUP_SHIFT_SLOTS],
  );

  if (rows.length === 0) {
    return {
      capacity_per_shift: PICKUP_SHIFT_CAPACITY,
      from_date: formatDate(new Date()),
      to_date: formatDate(new Date()),
      days: [],
    };
  }

  const daysMap = new Map();

  for (const row of rows) {
    const dateKey = formatDate(row.pickup_date);
    const shiftConfig = SHIFT_BY_PICKUP_SLOT[row.id];
    const bookedCount = Number(row.booked_count);
    const remaining = Math.max(0, PICKUP_SHIFT_CAPACITY - bookedCount);

    const slot = {
      id: row.id,
      shift_type: shiftConfig?.shift_type ?? null,
      start_time: row.start_time,
      end_time: row.end_time,
      is_peak: row.is_peak,
      peak_extra_charge: row.peak_extra_charge,
      booked_count: bookedCount,
      remaining,
      is_available: bookedCount < PICKUP_SHIFT_CAPACITY,
    };

    if (!daysMap.has(dateKey)) {
      daysMap.set(dateKey, { date: dateKey, slots: [] });
    }
    daysMap.get(dateKey).slots.push(slot);
  }

  const days = Array.from(daysMap.values());
  const from_date = days[0]?.date ?? formatDate(new Date());
  const to_date = days[days.length - 1]?.date ?? from_date;

  return {
    capacity_per_shift: PICKUP_SHIFT_CAPACITY,
    from_date,
    to_date,
    days,
  };
};
