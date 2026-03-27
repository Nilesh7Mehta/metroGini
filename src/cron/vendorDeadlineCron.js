import cron from 'node-cron';
import sql from '../config/db.js';
import { createNotificationsBatch } from '../utils/notificationHelper.js';

/**
 * Runs every hour.
 * Finds orders that are still in_process / order_finalized / ready_for_delivery
 * but whose delivery_date is TODAY and delivery slot starts within the next 3 hours.
 * Sends a single reminder per order (tracked via a notified flag or by checking
 * existing notifications to avoid duplicates).
 */
const sendDeliveryDeadlineReminders = async () => {
  try {
    const { rows } = await sql.query(
      `SELECT
         o.id AS order_id,
         o.vendor_id,
         TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
         ts.start_time AS delivery_slot_start
       FROM orders o
       JOIN time_slots ts ON ts.id = o.delivery_slot_id
       WHERE o.status IN ('in_process', 'order_finalized', 'ready_for_delivery')
         AND o.delivery_date = CURRENT_DATE
         AND (o.delivery_date + ts.start_time) BETWEEN NOW() AND NOW() + INTERVAL '3 hours'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.identity_id = o.vendor_id
             AND n.role = 'vendor'
             AND n.reference_type = 'order'
             AND n.reference_id = o.id
             AND n.title = 'Delivery Deadline Approaching'
         )`
    );

    if (rows.length === 0) return;

    const notifications = rows.map((r) => ({
      identity_id: r.vendor_id,
      role: 'vendor',
      title: 'Delivery Deadline Approaching',
      message: `Order #${r.order_id} is scheduled for delivery today at ${r.delivery_slot_start}. Please ensure it is ready for dispatch.`,
      reference_type: 'order',
      reference_id: r.order_id,
    }));

    await createNotificationsBatch(notifications);
    console.log(`[DeadlineCron] Sent ${notifications.length} delivery deadline reminder(s)`);
  } catch (error) {
    console.error('[DeadlineCron] Error sending deadline reminders:', error);
  }
};

// Runs every hour
cron.schedule('0 * * * *', sendDeliveryDeadlineReminders);

export { sendDeliveryDeadlineReminders };
