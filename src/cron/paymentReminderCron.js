import cron from "node-cron";
import sql from "../config/db.js";
import { APP_TIMEZONE } from "../config/db.js";
import { createNotificationsBatch } from "../utils/notificationHelper.js";
import { formatOrderDisplayId } from "../utils/userNotificationTemplates.js";
import { PAYMENT_STATUS } from "../utils/status.js";
import { sendPaymentReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";
import {
  sendPaymentReminderEmail,
  sendUserEmailSafe,
} from "../services/common/email.service.js";

const REMINDER_TITLE = "Payment Reminder";

/**
 * Unpaid remaining balance after the bill is finalized.
 * WhatsApp payment reminder every 2 hours until the balance is paid
 * or the order is delivered (doorstep collection) / cancelled.
 * The first reminder waits 2 hours after order_finalized_at so it does
 * not stack on the bill message sent at finalize.
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
        AND o.status IN (
          'order_finalized',
          'ready_for_delivery',
          'out_for_delivery'
        )
        AND COALESCE(
          (
            SELECT MAX(n.created_at)
            FROM notifications n
            WHERE n.identity_id = o.user_id
              AND n.role = 'user'
              AND n.reference_type = 'order'
              AND n.reference_id = o.id
              AND n.title = $2
          ),
          o.order_finalized_at,
          (CURRENT_TIMESTAMP AT TIME ZONE $3) - INTERVAL '3 hours'
        ) <= (CURRENT_TIMESTAMP AT TIME ZONE $3) - INTERVAL '2 hours'
      ORDER BY o.id ASC
      `,
      [PAYMENT_STATUS.PARTIALLY_PAID, REMINDER_TITLE, APP_TIMEZONE],
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

      sendUserEmailSafe(order.user_id, sendPaymentReminderEmail, {
        userId: order.user_id,
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

/** Every 2 hours — repeat while the balance is still unpaid */
export const startPaymentReminderCron = () => {
  cron.schedule(
    "0 */2 * * *",
    () => {
      sendDuePaymentReminders().catch(() => {});
    },
    { timezone: APP_TIMEZONE },
  );
};
