import cron from "node-cron";
import { APP_TIMEZONE } from "../config/db.js";
import { assignNextDayOrders } from "../models/riders/orderSplit.model.js";

/** Nightly 22:00 Asia/Kolkata — split next-day unassigned pickups across shift riders. */
export const AssignOrderToRider = () => {
  cron.schedule(
    "0 22 * * *",
    async () => {
      console.log("🔄 Running next-day assignment cron...");

      try {
        await assignNextDayOrders();
        console.log("✅ Orders assigned for next day");
      } catch (error) {
        console.error("❌ Cron Error:", error);
      }
    },
    { timezone: APP_TIMEZONE },
  );
};
