import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { sendRegNotOrderedReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";
import { sendIncompleteBookingEmail } from "../services/common/email.service.js";
import { isEmailEnabled } from "../config/email.js";

const DEFAULT_IDLE_MINUTES = 60;
const DEFAULT_MAX_REMINDERS = 3;

/**
 * Ordered WhatsApp sequence after registration for users who never booked
 * (new registered / registered no booking / add-to-cart but never booked).
 * Clock = users.created_at. Each step is sent once, in order.
 */
export const REG_NOT_ORDERED_STEPS = Object.freeze([
  { step: 1, afterMinutes: 15, label: "15 minutes" },
  { step: 2, afterMinutes: 2 * 60, label: "2 hours" },
  { step: 3, afterMinutes: 24 * 60, label: "24 hours" },
  { step: 4, afterMinutes: 48 * 60, label: "48 hours" },
  { step: 5, afterMinutes: 5 * 24 * 60, label: "5 days" },
  { step: 6, afterMinutes: 7 * 24 * 60, label: "7 days" },
]);

const positiveIntEnv = (key, fallback) => {
  const n = Number(String(process.env[key] || "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Next unmet step that is due for registered users with no placed order.
 * last_step = MAX(step) already sent (0 if none).
 */
export const REG_NOT_ORDERED_CANDIDATES_SQL = `
  SELECT u.id AS user_id,
         d.id AS order_id,
         u.created_at AS registered_at,
         u.full_name,
         u.mobile,
         COALESCE(r.last_step, 0)::int AS last_step,
         FLOOR(
           EXTRACT(
             EPOCH FROM (
               (CURRENT_TIMESTAMP AT TIME ZONE $1) - u.created_at
             )
           ) / 60
         )::int AS minutes_since_registration
  FROM users u
  LEFT JOIN LATERAL (
    SELECT o.id
    FROM orders o
    WHERE o.user_id = u.id
      AND o.status = 'draft'
    ORDER BY o.updated_at DESC
    LIMIT 1
  ) d ON TRUE
  LEFT JOIN LATERAL (
    SELECT MAX(step)::int AS last_step
    FROM abandoned_cart_reminders ar
    WHERE ar.user_id = u.id
  ) r ON TRUE
  WHERE u.role = 'user'
    AND u.is_deleted = FALSE
    AND COALESCE(u.status, 'active') = 'active'
    AND (u.is_mobile_verified = TRUE OR u.terms_and_condition = TRUE)
    AND u.mobile IS NOT NULL
    AND TRIM(u.mobile) <> ''
    AND COALESCE(r.last_step, 0) < $2
    AND u.created_at <= (CURRENT_TIMESTAMP AT TIME ZONE $1)
          - ($3::int * INTERVAL '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM orders prev
      WHERE prev.user_id = u.id
        AND prev.status <> 'draft'
    )
  ORDER BY u.created_at ASC
  LIMIT 500
`;

const nextDueStep = (lastStep, minutesSinceRegistration) => {
  const next = REG_NOT_ORDERED_STEPS.find((s) => s.step === lastStep + 1);
  if (!next) return null;
  if (minutesSinceRegistration < next.afterMinutes) return null;
  return next;
};

/**
 * Send the next due 1..6_reminder_reg_not_ordered template.
 * One step per user per cron run; stops once they place an order.
 */
export const sendAbandonedCartReminders = async () => {
  try {
    const firstDelay = REG_NOT_ORDERED_STEPS[0].afterMinutes;
    const maxStep = REG_NOT_ORDERED_STEPS[REG_NOT_ORDERED_STEPS.length - 1].step;

    const { rows } = await sql.query(REG_NOT_ORDERED_CANDIDATES_SQL, [
      APP_TIMEZONE,
      maxStep,
      firstDelay,
    ]);

    if (rows.length === 0) return { sent: 0, byStep: {} };

    let sent = 0;
    const byStep = Object.fromEntries(
      REG_NOT_ORDERED_STEPS.map((s) => [s.step, 0]),
    );

    for (const row of rows) {
      const due = nextDueStep(
        Number(row.last_step) || 0,
        Number(row.minutes_since_registration) || 0,
      );
      if (!due) continue;

      // Claim the step first so overlapping runs never double-send
      const { rowCount } = await sql.query(
        `INSERT INTO abandoned_cart_reminders (user_id, order_id, sent_on, step)
         VALUES ($1, $2, (CURRENT_TIMESTAMP AT TIME ZONE $3)::date, $4)
         ON CONFLICT (user_id, step) DO NOTHING`,
        [row.user_id, row.order_id ?? null, APP_TIMEZONE, due.step],
      );
      if (rowCount === 0) continue;

      sendRegNotOrderedReminderSafe({
        mobile: row.mobile,
        name: row.full_name,
        step: due.step,
      });
      sent += 1;
      byStep[due.step] += 1;
    }

    console.log(
      `[AbandonedCartCron] Sent ${sent} reg_not_ordered reminder(s)`,
      byStep,
    );
    return { sent, byStep };
  } catch (error) {
    console.error("[AbandonedCartCron] Error:", error);
    return { sent: 0, error: error.message };
  }
};

export const getAbandonedCartParams = () => [
  APP_TIMEZONE,
  positiveIntEnv("ABANDONED_CART_IDLE_MINUTES", DEFAULT_IDLE_MINUTES),
  positiveIntEnv("ABANDONED_CART_MAX_REMINDERS", DEFAULT_MAX_REMINDERS),
];

/**
 * Add-to-cart customers (latest draft idle >= idleMinutes) who never placed an
 * order and have an email. Excludes users emailed today (IST) and users who
 * already got maxReminders emails in total.
 */
export const INCOMPLETE_BOOKING_EMAIL_CANDIDATES_SQL = `
  SELECT u.id AS user_id,
         d.id AS order_id,
         d.updated_at AS idle_since,
         u.full_name,
         TRIM(u.email) AS email
  FROM users u
  INNER JOIN LATERAL (
    SELECT o.id, o.updated_at
    FROM orders o
    WHERE o.user_id = u.id
      AND o.status = 'draft'
    ORDER BY o.updated_at DESC
    LIMIT 1
  ) d ON TRUE
  WHERE u.role = 'user'
    AND u.is_deleted = FALSE
    AND COALESCE(u.status, 'active') = 'active'
    AND u.email IS NOT NULL
    AND TRIM(u.email) <> ''
    AND d.updated_at <= NOW() - ($2::int * INTERVAL '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM orders prev
      WHERE prev.user_id = u.id
        AND prev.status <> 'draft'
    )
    AND NOT EXISTS (
      SELECT 1 FROM incomplete_booking_email_reminders r
      WHERE r.user_id = u.id
        AND r.sent_on = (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
    )
    AND (
      SELECT COUNT(*) FROM incomplete_booking_email_reminders r
      WHERE r.user_id = u.id
    ) < $3
  ORDER BY d.updated_at ASC
  LIMIT 500
`;

/** Incomplete booking email — one per user per IST day, max N per user. */
export const sendIncompleteBookingEmails = async () => {
  if (!isEmailEnabled()) return { sent: 0, skipped: "smtp_not_configured" };

  try {
    const { rows } = await sql.query(
      INCOMPLETE_BOOKING_EMAIL_CANDIDATES_SQL,
      getAbandonedCartParams(),
    );

    if (rows.length === 0) return { sent: 0 };

    let sent = 0;
    for (const row of rows) {
      // Claim today's slot first so overlapping runs never double-send
      const { rows: claimed } = await sql.query(
        `INSERT INTO incomplete_booking_email_reminders (user_id, order_id, sent_on)
         VALUES ($1, $2, (CURRENT_TIMESTAMP AT TIME ZONE $3)::date)
         ON CONFLICT (user_id, sent_on) DO NOTHING
         RETURNING id`,
        [row.user_id, row.order_id, APP_TIMEZONE],
      );
      if (claimed.length === 0) continue;

      try {
        await sendIncompleteBookingEmail({
          email: row.email,
          name: row.full_name,
          userId: row.user_id,
          orderId: row.order_id,
        });
        sent += 1;
      } catch (error) {
        // Release the slot so a later run can retry this user
        await sql.query(
          `DELETE FROM incomplete_booking_email_reminders WHERE id = $1`,
          [claimed[0].id],
        );
        console.error(
          `[AbandonedCartCron] Email failed user=${row.user_id}: ${error.message}`,
        );
      }
    }

    console.log(`[AbandonedCartCron] Sent ${sent} incomplete booking email(s)`);
    return { sent };
  } catch (error) {
    console.error("[AbandonedCartCron] Email error:", error);
    return { sent: 0, error: error.message };
  }
};

/** Every 5 minutes — needed so the 15-minute first WhatsApp fires on time */
export const startAbandonedCartCron = () => {
  cron.schedule(
    "*/5 * * * *",
    () => {
      sendAbandonedCartReminders().catch(() => {});
      sendIncompleteBookingEmails().catch(() => {});
    },
    { timezone: APP_TIMEZONE },
  );
};
