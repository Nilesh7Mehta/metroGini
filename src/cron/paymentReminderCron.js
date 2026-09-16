import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { createNotificationsBatch } from "../utils/notificationHelper.js";
import { formatOrderDisplayId } from "../utils/userNotificationTemplates.js";
import { PAYMENT_STATUS } from "../utils/status.js";
import { sendPaymentReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";

const REMINDER_TITLE = "Payment Reminder";

/**
 * Unpaid remaining balance, delivery today — remind once per order.
 */
export const sendDuePaymentReminders = async () => {
  try {
    const { rows } = await sql.query(
      `
      SELECT o.id, o.user_id, o.remaining_amount,
             u.full_name, u.mobile
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.payment_status = $1
        AND COALESCE(o.remaining_amount, 0) > 0
        AND o.delivery_date IS NOT NULL
        AND o.delivery_date = (CURRENT_TIMESTAMP AT TIME ZONE $2)::date
        AND o.status IN (
          'order_finalized',
          'ready_for_delivery',
          'out_for_delivery'
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.identity_id = o.user_id
            AND n.role = 'user'
            AND n.reference_type = 'order'
            AND n.reference_id = o.id
            AND n.title = $3
        )
      ORDER BY o.id ASC
      `,
      [PAYMENT_STATUS.PARTIALLY_PAID, APP_TIMEZONE, REMINDER_TITLE],
    );

    if (rows.length === 0) return { sent: 0 };

    let sent = 0;
    for (const order of rows) {
      await createNotificationsBatch([
        {
          identity_id: order.user_id,
          role: "user",
          title: REMINDER_TITLE,
          message: `Kindly complete the payment for order ${formatOrderDisplayId(order.id)} (₹${order.remaining_amount}) before your scheduled delivery.`,
          reference_type: "order",
          reference_id: order.id,
        },
      ]);

      sendPaymentReminderSafe({
        mobile: order.mobile,
        name: order.full_name,
        orderId: order.id,
        amountPayable: order.remaining_amount,
      });
      sent += 1;
    }

    console.log(`[PaymentReminderCron] Sent ${sent} payment reminder(s)`);
    return { sent };
  } catch (error) {
    console.error("[PaymentReminderCron] Error:", error);
    return { sent: 0, error: error.message };
  }
};

/** Hourly — once on delivery day while balance remains unpaid */
export const startPaymentReminderCron = () => {
  cron.schedule("0 * * * *", () => {
    sendDuePaymentReminders().catch(() => {});
  });
};
