import cron from 'node-cron';
import sql from '../config/db.js';
import { APP_TIMEZONE } from '../config/db.js';
import { getNextWorkDateAfter } from '../services/common/laundryGroupShiftSchedule.service.js';
import { createNotificationsBatch } from '../utils/notificationHelper.js';

const PENDING_STATUSES = ['in_process', 'order_finalized'];

/**
 * Daily: unfinished vendor orders past delivery_date → bump delivery_date
 * to that laundry's next work-shift day. Keeps delivery_date as the live field.
 */
export const rescheduleOverdueDeliveries = async () => {
  try {
    const { rows } = await sql.query(
      `
      SELECT
        o.id AS order_id,
        o.vendor_id,
        TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date
      FROM orders o
      WHERE o.vendor_id IS NOT NULL
        AND o.vendor_received_at IS NOT NULL
        AND o.delivery_date IS NOT NULL
        AND o.delivery_date < (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
        AND o.status = ANY($2::text[])
      ORDER BY o.delivery_date ASC, o.id ASC
      `,
      [APP_TIMEZONE, PENDING_STATUSES],
    );

    if (rows.length === 0) {
      console.log('[DeliveryRescheduleCron] No overdue unfinished orders');
      return { rescheduled: 0, skipped: 0 };
    }

    let rescheduled = 0;
    let skipped = 0;
    const notifications = [];

    for (const row of rows) {
      const next = await getNextWorkDateAfter(row.vendor_id, row.delivery_date);
      if (!next?.next_date || next.next_date <= row.delivery_date) {
        skipped += 1;
        console.warn(
          `[DeliveryRescheduleCron] Skip order #${row.order_id}: no next work day after ${row.delivery_date}`,
        );
        continue;
      }

      const { rowCount } = await sql.query(
        `
        UPDATE orders
        SET previous_delivery_date = delivery_date,
            delivery_date = $2::date,
            is_rescheduled = TRUE,
            rescheduled_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND vendor_received_at IS NOT NULL
          AND delivery_date = $3::date
          AND status = ANY($4::text[])
        `,
        [row.order_id, next.next_date, row.delivery_date, PENDING_STATUSES],
      );

      if (!rowCount) {
        skipped += 1;
        continue;
      }

      rescheduled += 1;
      notifications.push({
        identity_id: row.vendor_id,
        role: 'vendor',
        title: 'Delivery date rescheduled',
        message:
          `Order #${row.order_id} was still unfinished after ${row.delivery_date}. ` +
          `Delivery date moved to ${next.next_date} (your next work day).`,
        reference_type: 'order',
        reference_id: row.order_id,
      });
    }

    if (notifications.length > 0) {
      await createNotificationsBatch(notifications);
    }

    console.log(
      `[DeliveryRescheduleCron] Rescheduled ${rescheduled}, skipped ${skipped}`,
    );
    return { rescheduled, skipped };
  } catch (error) {
    console.error('[DeliveryRescheduleCron] Error:', error);
    return { rescheduled: 0, skipped: 0, error: error.message };
  }
};

// 00:05 Asia/Kolkata daily
cron.schedule('5 0 * * *', rescheduleOverdueDeliveries, {
  timezone: APP_TIMEZONE,
});

export default rescheduleOverdueDeliveries;
