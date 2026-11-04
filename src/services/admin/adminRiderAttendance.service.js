import sql, { APP_TIMEZONE } from "../../config/db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const parseDateParam = (value, field) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!DATE_RE.test(raw)) {
    throw { status: 400, message: `${field} must be in YYYY-MM-DD format` };
  }
  return raw;
};

const LOCAL_NOW = `(CURRENT_TIMESTAMP AT TIME ZONE $2)`;

/** Minutes for a session; an open session counts up to now. */
const SESSION_MINUTES = `COALESCE(
  ra.worked_minutes,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${LOCAL_NOW} - ra.check_in_at)) / 60))::int
)`;

const SESSIONS_JSON = `JSON_AGG(
  JSON_BUILD_OBJECT(
    'id', ra.id,
    'check_in_at', TO_CHAR(ra.check_in_at, 'HH24:MI'),
    'check_out_at', TO_CHAR(ra.check_out_at, 'HH24:MI'),
    'worked_minutes', ${SESSION_MINUTES},
    'auto_checked_out', ra.auto_checked_out
  ) ORDER BY ra.check_in_at
)`;

/**
 * Every rider for one day (default today): checked in now / checked out / absent.
 * Optional search on name or mobile.
 */
export const getRiderAttendanceByDate = async ({ date, search } = {}) => {
  const day = parseDateParam(date, "date");
  const term = String(search ?? "").trim();

  const { rows } = await sql.query(
    `WITH day AS (
       SELECT COALESCE($1::date, ${LOCAL_NOW}::date) AS d
     ),
     agg AS (
       SELECT ra.rider_id,
              COUNT(*)::int AS sessions,
              TO_CHAR(MIN(ra.check_in_at), 'HH24:MI') AS first_check_in,
              TO_CHAR(MAX(ra.check_out_at), 'HH24:MI') AS last_check_out,
              BOOL_OR(ra.check_out_at IS NULL) AS open_now,
              BOOL_OR(ra.auto_checked_out) AS auto_checked_out,
              SUM(${SESSION_MINUTES})::int AS worked_minutes,
              ${SESSIONS_JSON} AS session_list
       FROM rider_attendance ra, day
       WHERE ra.work_date = day.d
       GROUP BY ra.rider_id
     )
     SELECT r.id, r.full_name, r.mobile_number, r.status AS rider_status,
            TO_CHAR((SELECT d FROM day), 'YYYY-MM-DD') AS date,
            agg.sessions, agg.first_check_in, agg.last_check_out, agg.open_now,
            agg.auto_checked_out, agg.worked_minutes, agg.session_list
     FROM riders r
     LEFT JOIN agg ON agg.rider_id = r.id
     WHERE (agg.rider_id IS NOT NULL OR COALESCE(r.status, '') <> 'blocked')
       AND (
         $3 = ''
         OR r.full_name ILIKE '%' || $3 || '%'
         OR r.mobile_number ILIKE '%' || $3 || '%'
       )
     ORDER BY (agg.rider_id IS NULL), agg.open_now DESC NULLS LAST, r.full_name ASC NULLS LAST, r.id ASC`,
    [day, APP_TIMEZONE, term],
  );

  const resolvedDate =
    rows[0]?.date ??
    day ??
    (
      await sql.query(
        `SELECT TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`,
        [APP_TIMEZONE],
      )
    ).rows[0].d;

  const riders = rows.map((r) => {
    const present = r.sessions != null;
    return {
      rider_id: Number(r.id),
      name: r.full_name || null,
      mobile: r.mobile_number || null,
      rider_status: r.rider_status || null,
      attendance_status: !present ? "absent" : r.open_now ? "checked_in" : "checked_out",
      sessions: present ? r.sessions : 0,
      first_check_in: r.first_check_in ?? null,
      last_check_out: present && !r.open_now ? r.last_check_out : null,
      worked_minutes: present ? Number(r.worked_minutes || 0) : 0,
      auto_checked_out: Boolean(r.auto_checked_out),
      session_list: present ? r.session_list : [],
    };
  });

  return {
    date: resolvedDate,
    summary: {
      total_riders: riders.length,
      checked_in_now: riders.filter((r) => r.attendance_status === "checked_in").length,
      present: riders.filter((r) => r.attendance_status !== "absent").length,
      absent: riders.filter((r) => r.attendance_status === "absent").length,
    },
    riders,
  };
};

/** One rider, day by day, between from and to (default: current month to today). */
export const getRiderAttendanceHistory = async (riderId, { from, to } = {}) => {
  const id = Number(riderId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid rider id" };
  }
  const fromDate = parseDateParam(from, "from");
  const toDate = parseDateParam(to, "to");

  const riderResult = await sql.query(
    `SELECT id, full_name, mobile_number, status FROM riders WHERE id = $1`,
    [id],
  );
  if (riderResult.rows.length === 0) {
    throw { status: 404, message: "Rider not found" };
  }

  const { rows } = await sql.query(
    `WITH bounds AS (
       SELECT COALESCE($3::date, DATE_TRUNC('month', ${LOCAL_NOW})::date) AS from_d,
              COALESCE($4::date, ${LOCAL_NOW}::date) AS to_d
     )
     SELECT TO_CHAR(ra.work_date, 'YYYY-MM-DD') AS work_date,
            COUNT(*)::int AS sessions,
            TO_CHAR(MIN(ra.check_in_at), 'HH24:MI') AS first_check_in,
            TO_CHAR(MAX(ra.check_out_at), 'HH24:MI') AS last_check_out,
            BOOL_OR(ra.check_out_at IS NULL) AS open_now,
            BOOL_OR(ra.auto_checked_out) AS auto_checked_out,
            SUM(${SESSION_MINUTES})::int AS worked_minutes,
            ${SESSIONS_JSON} AS session_list,
            TO_CHAR(MIN(b.from_d), 'YYYY-MM-DD') AS from_d,
            TO_CHAR(MIN(b.to_d), 'YYYY-MM-DD') AS to_d
     FROM rider_attendance ra, bounds b
     WHERE ra.rider_id = $1
       AND ra.work_date BETWEEN b.from_d AND b.to_d
     GROUP BY ra.work_date
     ORDER BY ra.work_date DESC`,
    [id, APP_TIMEZONE, fromDate, toDate],
  );

  let range = { from: rows[0]?.from_d, to: rows[0]?.to_d };
  if (!range.from) {
    const { rows: b } = await sql.query(
      `SELECT TO_CHAR(COALESCE($2::date, DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE $1)::date), 'YYYY-MM-DD') AS from_d,
              TO_CHAR(COALESCE($3::date, (CURRENT_TIMESTAMP AT TIME ZONE $1)::date), 'YYYY-MM-DD') AS to_d`,
      [APP_TIMEZONE, fromDate, toDate],
    );
    range = { from: b[0].from_d, to: b[0].to_d };
  }

  const days = rows.map((r) => ({
    date: r.work_date,
    sessions: r.sessions,
    first_check_in: r.first_check_in,
    last_check_out: r.open_now ? null : r.last_check_out,
    checked_in_now: Boolean(r.open_now),
    auto_checked_out: Boolean(r.auto_checked_out),
    worked_minutes: Number(r.worked_minutes || 0),
    session_list: r.session_list,
  }));

  const rider = riderResult.rows[0];
  return {
    rider: {
      rider_id: Number(rider.id),
      name: rider.full_name || null,
      mobile: rider.mobile_number || null,
      rider_status: rider.status || null,
    },
    from: range.from,
    to: range.to,
    summary: {
      days_present: days.length,
      total_sessions: days.reduce((sum, d) => sum + d.sessions, 0),
      total_worked_minutes: days.reduce((sum, d) => sum + d.worked_minutes, 0),
    },
    days,
  };
};
