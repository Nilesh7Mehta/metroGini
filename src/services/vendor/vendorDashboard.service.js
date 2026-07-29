import sql from '../../config/db.js';
import { APP_TIMEZONE } from '../../config/db.js';
import { DAY_LABELS, getShiftScheduleForLaundry } from '../common/laundryGroupShiftSchedule.service.js';
import { orderTaskDashboardService } from './vendorOrder.service.js';

const SHORT_DAY_LABELS = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const formatDate = (date) =>
  date.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });

const getNowParts = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
};

const parsePgTime = (value) => {
  if (value == null) return null;
  const raw = String(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3] || 0),
  };
};

const formatTime24 = (value) => {
  const parsed = parsePgTime(value);
  if (!parsed) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(parsed.hours)}:${pad(parsed.minutes)}`;
};

const formatTime12 = (value) => {
  const parsed = parsePgTime(value);
  if (!parsed) return null;
  const period = parsed.hours >= 12 ? 'PM' : 'AM';
  const hour12 = parsed.hours % 12 || 12;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hour12)}:${pad(parsed.minutes)} ${period}`;
};

const formatDateLabel = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]}`;
};

const formatIsoWithOffset = (dateStr, time24) => {
  if (!dateStr || !time24) return null;
  const timePart = time24.length === 5 ? `${time24}:00` : time24;
  return `${dateStr}T${timePart}+05:30`;
};

const addDaysToDateStr = (dateStr, days) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const isoDowFromDateStr = (dateStr) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  // JS: 0=Sun…6=Sat → ISO: 1=Mon…7=Sun
  const jsDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return jsDow === 0 ? 7 : jsDow;
};

const resolveShiftType = (shiftName) => {
  if (!shiftName) return null;
  return String(shiftName).trim().toLowerCase().split(/\s+/)[0];
};

const fetchActiveShifts = async () => {
  const { rows } = await sql.query(
    `
    SELECT id, shift_name, start_time::text AS start_time, end_time::text AS end_time
    FROM shifts
    WHERE COALESCE(status, TRUE) IS TRUE
    ORDER BY start_time ASC, id ASC
    `,
  );
  return rows;
};

const fetchOverview = async (vendor_id) => {
  const { rows } = await sql.query(
    `
    SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(
        CASE
          WHEN actual_weight IS NOT NULL AND actual_weight > 0 THEN actual_weight
          ELSE 0
        END
      ), 0)::float AS total_weight_kg,
      COALESCE(SUM(
        CASE
          WHEN actual_clothes_count IS NOT NULL AND actual_clothes_count > 0
            THEN actual_clothes_count
          ELSE 0
        END
      ), 0)::int AS total_clothes
    FROM orders
    WHERE vendor_id = $1
      AND status NOT IN ('draft', 'cancelled')
    `,
    [vendor_id],
  );

  const row = rows[0] || {};
  return {
    total_orders: Number(row.total_orders) || 0,
    total_weight_kg: Number(row.total_weight_kg) || 0,
    total_clothes: Number(row.total_clothes) || 0,
  };
};

const buildWorkDays = (schedule) => {
  const days = [];
  const seen = new Set();
  for (const entry of schedule) {
    const dow = Number(entry.day_of_week);
    if (!dow || seen.has(dow)) continue;
    seen.add(dow);
    days.push({
      day_of_week: dow,
      label: DAY_LABELS[dow] || null,
    });
  }
  days.sort((a, b) => a.day_of_week - b.day_of_week);
  return days;
};

const shortenDeadline = (deadline) => {
  if (!deadline?.date) return null;
  const dow = deadline.day_of_week != null ? Number(deadline.day_of_week) : null;
  return {
    date: deadline.date,
    day_label: dow != null ? SHORT_DAY_LABELS[dow] || deadline.day_label : deadline.day_label,
    day_of_week: dow,
    shift_id: deadline.shift_id,
    shift_name: deadline.shift_name,
    pincode_group_id: deadline.pincode_group_id,
  };
};

const buildDeadlines = (taskDash) => {
  const current =
    taskDash.task_deadline?.date
      ? {
          task_deadline: shortenDeadline(taskDash.task_deadline),
          task_progress: taskDash.task_progress,
        }
      : null;

  const overdue =
    taskDash.overdue_task_deadline?.date
      ? {
          task_deadline: shortenDeadline(taskDash.overdue_task_deadline),
          task_progress: taskDash.overdue_task_progress,
        }
      : null;

  return { current, overdue };
};

const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const fetchOrdersByWorkday = async (vendor_id, _workDayDows, todayStr) => {
  const [year, month] = todayStr.split('-').map(Number);
  if (!year || !month) return [];

  const pad = (n) => String(n).padStart(2, '0');
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;

  const { rows } = await sql.query(
    `
    SELECT
      o.delivery_date::date AS delivery_date,
      COUNT(*)::int AS orders
    FROM orders o
    WHERE o.vendor_id = $1
      AND o.delivery_date >= $2::date
      AND o.delivery_date <= $3::date
      AND o.status NOT IN ('draft', 'cancelled')
    GROUP BY o.delivery_date
    ORDER BY o.delivery_date ASC
    `,
    [vendor_id, monthStart, monthEnd],
  );

  const toDateKey = (value) => {
    if (value instanceof Date) return formatDate(value);
    const raw = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : formatDate(new Date(raw));
  };

  // Only dates that have at least one order with that delivery_date.
  return rows.map((r) => {
    const date = toDateKey(r.delivery_date);
    const dow = isoDowFromDateStr(date);
    return {
      date,
      day: SHORT_DAY_LABELS[dow] || null,
      label: formatDateLabel(date),
      orders: Number(r.orders) || 0,
    };
  });
};

const buildRosterEvent = ({
  id,
  date,
  dayOfWeek,
  type,
  startTime,
  nowDate,
  nowTime,
}) => {
  const time_24 = formatTime24(startTime);
  const time = formatTime12(startTime);
  const day_label = (SHORT_DAY_LABELS[dayOfWeek] || '').toUpperCase();
  const date_label = formatDateLabel(date);
  const fullDay = DAY_LABELS[dayOfWeek] || '';
  const kind = type === 'morning' ? 'delivery' : 'pickup';
  const type_label =
    type === 'morning' ? 'MORNING (Delivery)' : 'EVENING (Pickup)';
  const title =
    kind === 'delivery' ? 'Next Delivery to Rider' : 'Next Pickup by Rider';
  const datetime = formatIsoWithOffset(date, time_24);
  const completed =
    date < nowDate || (date === nowDate && time_24 && `${time_24}:00` <= nowTime);

  return {
    id,
    date,
    day_label,
    date_label,
    type,
    type_label,
    time,
    time_24,
    completed,
    kind,
    title,
    datetime,
    when_label:
      date_label && fullDay && time
        ? `${date_label} (${fullDay}), ${time}`
        : null,
  };
};

const buildRoster = (workDayDows, shifts, todayStr, nowTime) => {
  const morningShift =
    shifts.find((s) => resolveShiftType(s.shift_name) === 'morning') || shifts[0] || null;
  const eveningShift =
    shifts.find((s) => resolveShiftType(s.shift_name) === 'evening') ||
    shifts[shifts.length - 1] ||
    null;

  const shiftsPerWeek = workDayDows.length;

  if (!workDayDows.length || (!morningShift && !eveningShift)) {
    return {
      shifts_per_week: shiftsPerWeek,
      shifts: [],
      coming_up: [],
    };
  }

  // Next 3 work days (including today when it is a work day).
  const rosterDates = [];
  for (let offset = 0; offset < 28 && rosterDates.length < 3; offset += 1) {
    const date = addDaysToDateStr(todayStr, offset);
    const dow = isoDowFromDateStr(date);
    if (workDayDows.includes(dow)) {
      rosterDates.push({ date, day_of_week: dow });
    }
  }

  const rosterShifts = [];
  let idx = 1;
  for (const { date, day_of_week } of rosterDates) {
    if (morningShift) {
      rosterShifts.push(
        buildRosterEvent({
          id: `roster_${idx++}`,
          date,
          dayOfWeek: day_of_week,
          type: 'morning',
          startTime: morningShift.start_time,
          nowDate: todayStr,
          nowTime,
        }),
      );
    }
    if (eveningShift) {
      rosterShifts.push(
        buildRosterEvent({
          id: `roster_${idx++}`,
          date,
          dayOfWeek: day_of_week,
          type: 'evening',
          startTime: eveningShift.start_time,
          nowDate: todayStr,
          nowTime,
        }),
      );
    }
  }

  const comingUp = rosterShifts
    .filter((s) => !s.completed)
    .slice(0, 3)
    .map((s, i) => ({
      id: `cu_${i + 1}`,
      kind: s.kind,
      title: s.title,
      datetime: s.datetime,
      when_label: s.when_label,
    }));

  // Public roster.shifts payload (without internal kind/title helpers if preferred —
  // keep fields from the design mock).
  const shiftsPayload = rosterShifts.map(
    ({ id, date, day_label, date_label, type, type_label, time, time_24, completed }) => ({
      id,
      date,
      day_label,
      date_label,
      type,
      type_label,
      time,
      time_24,
      completed,
    }),
  );

  return {
    shifts_per_week: shiftsPerWeek,
    shifts: shiftsPayload,
    coming_up: comingUp,
  };
};

export const getVendorDashboardService = async (vendor_id) => {
  const { date: todayStr, time: nowTime } = getNowParts();

  const [overview, schedule, taskDash, shifts] = await Promise.all([
    fetchOverview(vendor_id),
    getShiftScheduleForLaundry(vendor_id),
    orderTaskDashboardService(vendor_id),
    fetchActiveShifts(),
  ]);

  const workDayEntries = buildWorkDays(schedule);
  const workDayDows = workDayEntries.map((d) => d.day_of_week);
  const work_days = workDayEntries.map((d) => d.label).filter(Boolean);

  const [orders_by_workday, roster] = await Promise.all([
    fetchOrdersByWorkday(vendor_id, workDayDows, todayStr),
    Promise.resolve(buildRoster(workDayDows, shifts, todayStr, nowTime)),
  ]);

  return {
    overview,
    work_days,
    deadlines: buildDeadlines(taskDash),
    orders_by_workday,
    roster,
  };
};
