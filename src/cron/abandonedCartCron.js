import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { sendIncompleteBookingReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";
import { sendIncompleteBookingEmail } from "../services/common/email.service.js";
import { isEmailEnabled } from "../config/email.js";

const DEFAULT_IDLE_MINUTES = 60;
const DEFAULT_MAX_REMINDERS = 3;

const positiveIntEnv = (key, fallback) => {
  const n = Number(String(process.env[key] || "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Registered customers who never placed an order (no non-draft order ever):
 * - with a draft: idle since the latest draft's updated_at
 * - without a draft: idle since registration (created_at)
 * Idle >= idleMinutes. Excludes users already reminded today (IST)
 * and users who already got maxReminders in total.
 */
export const ABANDONED_CART_CANDIDATES_SQL = `
  SELECT u.id AS user_id,
         d.id AS order_id,
         COALESCE(d.updated_at, u.created_at) AS idle_since,
         u.full_name,
         u.mobile
  FROM users u
  LEFT JOIN LATERAL (
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
    AND (u.is_mobile_verified = TRUE OR u.terms_and_condition = TRUE)
    AND u.mobile IS NOT NULL
    AND TRIM(u.mobile) <> ''
    AND COALESCE(d.updated_at, u.created_at) <= NOW() - ($2::int * INTERVAL '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM orders prev
      WHERE prev.user_id = u.id
        AND prev.status <> 'draft'
    )
    AND NOT EXISTS (
      SELECT 1 FROM abandoned_cart_reminders r
      WHERE r.user_id = u.id
        AND r.sent_on = (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
    )
    AND (
      SELECT COUNT(*) FROM abandoned_cart_reminders r
      WHERE r.user_id = u.id
    ) < $3
  ORDER BY idle_since ASC
  LIMIT 500
`;

export const getAbandonedCartParams = () => [
  APP_TIMEZONE,
  positiveIntEnv("ABANDONED_CART_IDLE_MINUTES", DEFAULT_IDLE_MINUTES),
  positiveIntEnv("ABANDONED_CART_MAX_REMINDERS", DEFAULT_MAX_REMINDERS),
];

/**
 * Incomplete booking — incomplete_booking_reminder1 WhatsApp.
 * Registered users with no placed order (draft or no cart at all).
 * One per user per IST day, max N per user.
 */
export const sendAbandonedCartReminders = async () => {
  try {
    const { rows } = await sql.query(
      ABANDONED_CART_CANDIDATES_SQL,
      getAbandonedCartParams(),
    );

    if (rows.length === 0) return { sent: 0 };

    let sent = 0;
    for (const row of rows) {
      // Claim today's slot first so overlapping runs never double-send
      const { rowCount } = await sql.query(
        `INSERT INTO abandoned_cart_reminders (user_id, order_id, sent_on)
         VALUES ($1, $2, (CURRENT_TIMESTAMP AT TIME ZONE $3)::date)
         ON CONFLICT (user_id, sent_on) DO NOTHING`,
        [row.user_id, row.order_id ?? null, APP_TIMEZONE],
      );
      if (rowCount === 0) continue;

      sendIncompleteBookingReminderSafe({
        mobile: row.mobile,
        name: row.full_name,
      });
      sent += 1;
    }

    console.log(`[AbandonedCartCron] Sent ${sent} incomplete booking reminder(s)`);
    return { sent };
  } catch (error) {
    console.error("[AbandonedCartCron] Error:", error);
    return { sent: 0, error: error.message };
  }
};

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

/** Every 2 hours, 09:00–21:00 Asia/Kolkata */
export const startAbandonedCartCron = () => {
  cron.schedule(
    "0 9-21/2 * * *",
    () => {
      sendAbandonedCartReminders().catch(() => {});
      sendIncompleteBookingEmails().catch(() => {});
    },
    { timezone: APP_TIMEZONE },
  );
};
