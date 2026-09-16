import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { createNotificationsBatch } from "../utils/notificationHelper.js";
import { sendCustomerReengagementOfferSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";

/** One-time customer (exactly 1 delivered order) — milestone days */
const DEFAULT_MILESTONES = [21, 45, 90];

const reminderTitle = (days) => `Reengagement Offer ${days}d`;

const parseMilestones = () => {
  const raw = String(process.env.REENGAGEMENT_MILESTONE_DAYS || "").trim();
  if (!raw) return DEFAULT_MILESTONES;
  const parsed = raw
    .split(",")
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_MILESTONES;
};

const couponCode = () =>
  String(process.env.REENGAGEMENT_COUPON_CODE || "VALUED10").trim() ||
  "VALUED10";

/**
 * One-time customers (exactly 1 delivered order, no repeat).
 * Sends customer_reengagement_offer at 21 / 45 / 90 days since that order.
 * Each milestone once; at most one WhatsApp per user per cron run
 * (lowest unmet milestone they qualify for).
 */
export const sendCustomerReengagementOffers = async () => {
  try {
    const milestones = parseMilestones();
    const minDays = milestones[0];
    const code = couponCode();

    const { rows } = await sql.query(
      `
      WITH one_time AS (
        SELECT user_id,
               COUNT(*)::int AS delivered_orders,
               MAX(COALESCE(delivered_at, delivery_completed_at, updated_at)) AS last_order_date
        FROM orders
        WHERE status = 'delivered'
        GROUP BY user_id
        HAVING COUNT(*) = 1
      )
      SELECT u.id AS user_id,
             u.full_name,
             u.mobile,
             ot.last_order_date,
             FLOOR(
               EXTRACT(
                 EPOCH FROM (
                   (CURRENT_TIMESTAMP AT TIME ZONE $1)
                   - ot.last_order_date
                 )
               ) / 86400
             )::int AS days_inactive
      FROM one_time ot
      INNER JOIN users u ON u.id = ot.user_id AND u.role = 'user'
      WHERE ot.last_order_date <= (CURRENT_TIMESTAMP AT TIME ZONE $1)
            - ($2::int * INTERVAL '1 day')
        AND u.mobile IS NOT NULL
        AND TRIM(u.mobile) <> ''
      ORDER BY ot.last_order_date ASC
      LIMIT 500
      `,
      [APP_TIMEZONE, minDays],
    );

    if (rows.length === 0) return { sent: 0 };

    let sent = 0;
    const byMilestone = Object.fromEntries(milestones.map((d) => [d, 0]));

    for (const user of rows) {
      const daysInactive = Number(user.days_inactive) || 0;

      // Lowest unmet milestone this customer qualifies for
      let dueMilestone = null;
      for (const m of milestones) {
        if (daysInactive < m) break;

        const { rows: existing } = await sql.query(
          `SELECT 1 FROM notifications
           WHERE identity_id = $1 AND role = 'user' AND title = $2
           LIMIT 1`,
          [user.user_id, reminderTitle(m)],
        );
        if (existing.length === 0) {
          dueMilestone = m;
          break;
        }
      }

      if (dueMilestone == null) continue;

      const title = reminderTitle(dueMilestone);
      await createNotificationsBatch([
        {
          identity_id: user.user_id,
          role: "user",
          title,
          message: `It's been ${dueMilestone} days since your last wash — enjoy 10% off with coupon ${code}, valid for 3 days.`,
          reference_type: "user",
          reference_id: user.user_id,
        },
      ]);

      sendCustomerReengagementOfferSafe({
        mobile: user.mobile,
        name: user.full_name,
        couponCode: code,
      });

      sent += 1;
      byMilestone[dueMilestone] += 1;
    }

    console.log(
      `[ReengagementCron] Sent ${sent} one-time-customer offer(s)`,
      byMilestone,
    );
    return { sent, byMilestone };
  } catch (error) {
    console.error("[ReengagementCron] Error:", error);
    return { sent: 0, error: error.message };
  }
};

/** Daily 10:00 Asia/Kolkata */
export const startReengagementCron = () => {
  cron.schedule(
    "0 10 * * *",
    () => {
      sendCustomerReengagementOffers().catch(() => {});
    },
    { timezone: APP_TIMEZONE },
  );
};
