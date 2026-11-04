import cron from "node-cron";
import { APP_TIMEZONE } from "../config/db.js";
import { autoCheckOutOpenSessions } from "../services/rider/riderAttendance.service.js";

/** 23:59 Asia/Kolkata — close sessions riders forgot to check out of. */
export const startRiderAttendanceCron = () => {
  cron.schedule(
    "59 23 * * *",
    async () => {
      try {
        const closed = await autoCheckOutOpenSessions();
        console.log(`[RiderAttendanceCron] Auto checked out ${closed} session(s)`);
      } catch (error) {
        console.error("[RiderAttendanceCron] Error:", error);
      }
    },
    { timezone: APP_TIMEZONE },
  );
};
