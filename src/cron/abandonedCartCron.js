import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { sendAbandonedCartReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";

const DEFAULT_IDLE_MINUTES = 60;
const DEFAULT_MAX_REMINDERS = 3;

const positiveIntEnv = (key, fallback) => {
  const n = Number(String(process.env[key] || "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Draft orders idle for >= idleMinutes, first-order customers only
 * (no non-draft order ever). Excludes users already reminded today (IST)
 * and drafts that already got maxReminders.
 */
export const ABANDONED_CART_CANDIDATES_SQL = `
  SELECT o.id AS order_id,
         o.user_id,
         o.updated_at,
         u.full_name,
         u.mobile
  FROM orders o
  INNER JOIN users u ON u.id = o.user_id
  WHERE o.status = 'draft'
    AND o.updated_at <= NOW() - ($2::int * INTERVAL '1 minute')
    AND u.is_deleted = FALSE
    AND u.mobile IS NOT NULL
    AND TRIM(u.mobile) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM orders prev
      WHERE prev.user_id = o.user_id
        AND prev.status <> 'draft'
    )
    AND NOT EXISTS (
      SELECT 1 FROM abandoned_cart_reminders r
      WHERE r.user_id = o.user_id
        AND r.sent_on = (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
    )
    AND (
      SELECT COUNT(*) FROM abandoned_cart_reminders r
      WHERE r.order_id = o.id
    ) < $3
  ORDER BY o.updated_at ASC
  LIMIT 500
`;

export const getAbandonedCartParams = () => [
  APP_TIMEZONE,
  positiveIntEnv("ABANDONED_CART_IDLE_MINUTES", DEFAULT_IDLE_MINUTES),
  positiveIntEnv("ABANDONED_CART_MAX_REMINDERS", DEFAULT_MAX_REMINDERS),
];

/**
 * Abandoned cart (draft order) — abandoned_cart_reminder WhatsApp.
 * One per user per IST day, max N per draft, first-order customers only.
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
        [row.user_id, row.order_id, APP_TIMEZONE],
      );
      if (rowCount === 0) continue;

      sendAbandonedCartReminderSafe({
        mobile: row.mobile,
        name: row.full_name,
      });
      sent += 1;
    }

    console.log(`[AbandonedCartCron] Sent ${sent} abandoned cart reminder(s)`);
    return { sent };
  } catch (error) {
    console.error("[AbandonedCartCron] Error:", error);
    return { sent: 0, error: error.message };
  }
};

/** Every 2 hours, 09:00–21:00 Asia/Kolkata */
export const startAbandonedCartCron = () => {
  cron.schedule(
    "0 9-21/2 * * *",
    () => {
      sendAbandonedCartReminders().catch(() => {});
    },
    { timezone: APP_TIMEZONE },
  );
};
