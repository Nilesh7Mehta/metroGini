import sql, { APP_TIMEZONE } from "../../config/db.js";
import { SLOT_SAME_DAY_CUTOFF } from "../../constants/slotAvailability.js";

/**
 * SQL for the first bookable pickup date in APP_TIMEZONE:
 * today before SLOT_SAME_DAY_CUTOFF, otherwise tomorrow.
 * @param {string} tzParam  placeholder bound to APP_TIMEZONE (e.g. "$4")
 * @param {string} cutoffParam placeholder bound to SLOT_SAME_DAY_CUTOFF (e.g. "$5")
 */
export const firstBookableDateSql = (tzParam, cutoffParam) => `(
  CASE
    WHEN (CURRENT_TIMESTAMP AT TIME ZONE ${tzParam})::time < ${cutoffParam}::time
      THEN (CURRENT_TIMESTAMP AT TIME ZONE ${tzParam})::date
    ELSE (CURRENT_TIMESTAMP AT TIME ZONE ${tzParam})::date + 1
  END
)`;

const formatCutoffLabel = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
};

/** { firstDate, today, nowTime } — dates as YYYY-MM-DD, time as HH24:MI:SS (APP_TIMEZONE). */
export const getBookingWindow = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT
       TO_CHAR(${firstBookableDateSql("$1", "$2")}, 'YYYY-MM-DD') AS first_date,
       TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today,
       TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE $1)::time, 'HH24:MI:SS') AS now_time`,
    [APP_TIMEZONE, SLOT_SAME_DAY_CUTOFF],
  );
  return {
    firstDate: rows[0].first_date,
    today: rows[0].today,
    nowTime: rows[0].now_time,
  };
};

/**
 * Pickup date must be on/after the first bookable date; for today, the
 * pickup time slot must not have ended yet.
 */
export const assertPickupDateBookable = async (
  pickupDate,
  pickupSlotId = null,
  db = sql,
) => {
  const date = String(pickupDate || "").slice(0, 10);
  const { firstDate, today, nowTime } = await getBookingWindow(db);

  if (date < firstDate) {
    if (date === today) {
      throw {
        status: 400,
        message: `Same-day pickup can be booked only before ${formatCutoffLabel(SLOT_SAME_DAY_CUTOFF)}. Please choose ${firstDate} or later.`,
      };
    }
    throw { status: 400, message: "Pickup date cannot be in the past" };
  }

  if (date === today && pickupSlotId != null) {
    const { rows } = await db.query(
      `SELECT start_time, end_time FROM time_slots WHERE id = $1`,
      [pickupSlotId],
    );
    const slot = rows[0];
    if (
      slot &&
      String(slot.end_time) > String(slot.start_time) &&
      String(slot.end_time) <= nowTime
    ) {
      throw {
        status: 400,
        message: "This pickup slot has already ended today. Please choose another slot or date.",
      };
    }
  }
};
