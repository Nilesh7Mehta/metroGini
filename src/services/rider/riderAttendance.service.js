import sql, { APP_TIMEZONE } from "../../config/db.js";

const SESSION_COLUMNS = `
  id,
  TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date,
  TO_CHAR(check_in_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS check_in_at,
  TO_CHAR(check_out_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS check_out_at,
  auto_checked_out,
  worked_minutes
`;

const LOCAL_NOW = `(CURRENT_TIMESTAMP AT TIME ZONE $2)`;

const formatSession = (row) => ({
  id: Number(row.id),
  work_date: row.work_date,
  check_in_at: row.check_in_at,
  check_out_at: row.check_out_at ?? null,
  auto_checked_out: Boolean(row.auto_checked_out),
  worked_minutes: row.worked_minutes == null ? null : Number(row.worked_minutes),
});

export const findOpenSession = async (rider_id, db = sql) => {
  const { rows } = await db.query(
    `SELECT ${SESSION_COLUMNS}
     FROM rider_attendance
     WHERE rider_id = $1 AND check_out_at IS NULL
     LIMIT 1`,
    [rider_id],
  );
  return rows[0] ? formatSession(rows[0]) : null;
};

/** Start a session. Calling it while already checked in returns the open session. */
export const checkInService = async (rider_id) => {
  const existing = await findOpenSession(rider_id);
  if (existing) {
    return { already_checked_in: true, session: existing };
  }

  try {
    const { rows } = await sql.query(
      `INSERT INTO rider_attendance (rider_id, work_date, check_in_at)
       VALUES ($1, ${LOCAL_NOW}::date, ${LOCAL_NOW})
       RETURNING ${SESSION_COLUMNS}`,
      [rider_id, APP_TIMEZONE],
    );
    return { already_checked_in: false, session: formatSession(rows[0]) };
  } catch (error) {
    // Two check-in taps at once: the open-session unique index rejects the second
    if (error.code === "23505") {
      return { already_checked_in: true, session: await findOpenSession(rider_id) };
    }
    throw error;
  }
};

/** Close the rider's open session; returns it, or null if they weren't checked in. */
export const closeOpenSession = async (rider_id) => {
  const { rows } = await sql.query(
    `UPDATE rider_attendance
     SET check_out_at = ${LOCAL_NOW},
         worked_minutes = GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (${LOCAL_NOW} - check_in_at)) / 60)
         )::int,
         updated_at = NOW()
     WHERE rider_id = $1 AND check_out_at IS NULL
     RETURNING ${SESSION_COLUMNS}`,
    [rider_id, APP_TIMEZONE],
  );

  return rows[0] ? formatSession(rows[0]) : null;
};

export const checkOutService = async (rider_id) => {
  const session = await closeOpenSession(rider_id);
  if (!session) {
    throw { status: 400, message: "You are not checked in" };
  }
  return session;
};

/** Minutes worked in a session, counting an open session up to now. */
const sessionMinutesSql = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `COALESCE(
    ${p}worked_minutes,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${LOCAL_NOW} - ${p}check_in_at)) / 60))::int
  )`;
};

export const getTodayAttendanceService = async (rider_id) => {
  const { rows } = await sql.query(
    `SELECT ${SESSION_COLUMNS}, ${sessionMinutesSql()} AS minutes_so_far,
            TO_CHAR(${LOCAL_NOW}::date, 'YYYY-MM-DD') AS today
     FROM rider_attendance
     WHERE rider_id = $1
       AND (work_date = ${LOCAL_NOW}::date OR check_out_at IS NULL)
     ORDER BY check_in_at ASC`,
    [rider_id, APP_TIMEZONE],
  );

  const sessions = rows.map(formatSession);
  const open = sessions.find((s) => s.check_out_at == null) || null;
  const totalMinutes = rows.reduce((sum, r) => sum + Number(r.minutes_so_far || 0), 0);

  let today = rows[0]?.today;
  if (!today) {
    const { rows: d } = await sql.query(
      `SELECT TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS today`,
      [APP_TIMEZONE],
    );
    today = d[0].today;
  }

  return {
    date: today,
    checked_in: Boolean(open),
    current_session: open,
    sessions,
    total_worked_minutes: totalMinutes,
  };
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Day-by-day attendance for a month (YYYY-MM, default current month). */
export const getAttendanceHistoryService = async (rider_id, month) => {
  const raw = String(month || "").trim();
  if (raw && !MONTH_RE.test(raw)) {
    throw { status: 400, message: "month must be in YYYY-MM format" };
  }

  const { rows } = await sql.query(
    `WITH bounds AS (
       SELECT COALESCE(
                TO_DATE(NULLIF($3, '') || '-01', 'YYYY-MM-DD'),
                DATE_TRUNC('month', ${LOCAL_NOW})::date
              ) AS start_date
     )
     SELECT TO_CHAR(ra.work_date, 'YYYY-MM-DD') AS work_date,
            COUNT(*)::int AS sessions,
            TO_CHAR(MIN(ra.check_in_at), 'HH24:MI') AS first_check_in,
            TO_CHAR(MAX(ra.check_out_at), 'HH24:MI') AS last_check_out,
            BOOL_OR(ra.check_out_at IS NULL) AS open_now,
            BOOL_OR(ra.auto_checked_out) AS auto_checked_out,
            SUM(${sessionMinutesSql("ra")})::int AS worked_minutes,
            TO_CHAR((SELECT start_date FROM bounds), 'YYYY-MM') AS month
     FROM rider_attendance ra, bounds b
     WHERE ra.rider_id = $1
       AND ra.work_date >= b.start_date
       AND ra.work_date < (b.start_date + INTERVAL '1 month')::date
     GROUP BY ra.work_date
     ORDER BY ra.work_date DESC`,
    [rider_id, APP_TIMEZONE, raw],
  );

  const days = rows.map((r) => ({
    date: r.work_date,
    sessions: r.sessions,
    first_check_in: r.first_check_in,
    last_check_out: r.open_now ? null : r.last_check_out,
    checked_in_now: Boolean(r.open_now),
    auto_checked_out: Boolean(r.auto_checked_out),
    worked_minutes: Number(r.worked_minutes || 0),
  }));

  return {
    month: rows[0]?.month ?? (raw || null),
    days_present: days.length,
    total_worked_minutes: days.reduce((sum, d) => sum + d.worked_minutes, 0),
    days,
  };
};

/**
 * Nightly: close every session the rider forgot to check out of, so each day
 * starts with a fresh check-in. Check-out time = end of the rider's last
 * scheduled shift that day; if there is none (or they checked in after it
 * ended), the time the job runs.
 */
export const autoCheckOutOpenSessions = async () => {
  const { rows } = await sql.query(
    `WITH open_sessions AS (
       SELECT ra.id,
              ra.check_in_at,
              (
                SELECT ra.work_date + MAX(s.end_time)
                FROM rider_group_shift_schedule rgss
                JOIN shifts s ON s.id = rgss.shift_id
                WHERE rgss.rider_id = ra.rider_id
                  AND rgss.day_of_week = EXTRACT(ISODOW FROM ra.work_date)::int
                  AND s.end_time > s.start_time
              ) AS shift_end
       FROM rider_attendance ra
       WHERE ra.check_out_at IS NULL
     ),
     resolved AS (
       SELECT id,
              check_in_at,
              CASE
                WHEN shift_end IS NOT NULL
                 AND shift_end > check_in_at
                 AND shift_end <= (CURRENT_TIMESTAMP AT TIME ZONE $1)
                  THEN shift_end
                ELSE (CURRENT_TIMESTAMP AT TIME ZONE $1)
              END AS check_out_at
       FROM open_sessions
     )
     UPDATE rider_attendance ra
     SET check_out_at = r.check_out_at,
         worked_minutes = GREATEST(
           0,
           FLOOR(EXTRACT(EPOCH FROM (r.check_out_at - r.check_in_at)) / 60)
         )::int,
         auto_checked_out = true,
         updated_at = NOW()
     FROM resolved r
     WHERE ra.id = r.id
     RETURNING ra.rider_id`,
    [APP_TIMEZONE],
  );
  return rows.length;
};
