import cron from "node-cron";
import sql from "../config/db.js";
import { generateOTP } from "../utils/otp.js";
import { createNotificationsBatch } from "../utils/notificationHelper.js";
import {
  sendPickupOtpEmail,
  sendUserEmailSafe,
} from "../services/common/email.service.js";
import { sendPickupDayReminderSafe } from "../services/whatsapp/gallaboxWhatsapp.service.js";
import { formatOrderDisplayId } from "../utils/userNotificationTemplates.js";


export const startPickupCron = () => {

  cron.schedule("*/2 * * * *", async () => {
    try {
      console.log("Cron is running ===============");
      
      const today = new Date().toISOString().split("T")[0];

      const { rows } = await sql.query(
        `SELECT o.id, o.user_id, o.order_code, o.assigned_rider_id,
                u.full_name, u.mobile
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE o.pickup_date = $1
         AND o.status = 'booked'`,
        [today]
      );

      for (const order of rows) {

        const otp = generateOTP();

        await sql.query(
          `UPDATE orders
           SET status = 'out_for_pickup',
               pickup_otp = $1,
               otp_generated_at = NOW(),
               out_for_pickup_at = NOW()
           WHERE id = $2`,
          [otp, order.id]
        );

        // Notify user their pickup is scheduled for today
        await createNotificationsBatch([{
          identity_id: order.user_id,
          role: 'user',
          title: 'Pickup Scheduled Today',
          message: `Your pickup for order ${formatOrderDisplayId(order.id)} is scheduled for today. Our rider will arrive at your selected time slot.`,
          reference_type: 'order',
          reference_id: order.id,
        }]);

        sendUserEmailSafe(order.user_id, sendPickupOtpEmail, {
          orderId: order.id,
          orderCode: order.order_code,
          otp,
        });

        sendPickupDayReminderSafe({
          mobile: order.mobile,
          name: order.full_name,
          orderId: order.id,
        });

        // Rider already assigned at booking → send OTP pickup update once
        if (order.assigned_rider_id) {
          const { notifyPickupUpdateForOrders } = await import(
            "../services/whatsapp/gallaboxWhatsapp.service.js"
          );
          await notifyPickupUpdateForOrders([order.id]);
        }

        console.log(`Order ${order.id} moved to out_for_pickup`);
      }

    } catch (error) {
      console.error("Pickup Cron Error:", error);
    }
  });

};