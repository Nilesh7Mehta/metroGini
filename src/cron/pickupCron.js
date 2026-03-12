import cron from "node-cron";
import sql from "../config/db.js";
import { generateOTP } from "../utils/otp.js";


export const startPickupCron = () => {

  cron.schedule("*/5 * * * *", async () => {
    try {

      const today = new Date().toISOString().split("T")[0];

      const { rows } = await sql.query(
        `SELECT id, user_id
         FROM orders
         WHERE pickup_date = $1
         AND status = 'booked'`,
        [today]
      );

      for (const order of rows) {

        const otp = generateOTP();

        await sql.query(
          `UPDATE orders
           SET status = 'out_for_pickup',
               pickup_otp = $1,
               otp_generated_at = NOW()
           WHERE id = $2`,
          [otp, order.id]
        );

        console.log(`Order ${order.id} moved to out_for_pickup`);
      }

    } catch (error) {
      console.error("Pickup Cron Error:", error);
    }
  });

};