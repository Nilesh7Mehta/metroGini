import cron from "node-cron";
import { assignNextDayOrders } from "../models/riders/orderSplit.model.js";

export const AssignOrderToRider = () => {
cron.schedule("* * * * *", async () => {
  console.log("🔄 Running next-day assignment cron...");

  try {
    await assignNextDayOrders();
    console.log("✅ Orders assigned for next day");
  } catch (error) {
    console.error("❌ Cron Error:", error);
  }
});}
// cron.schedule("0 22 * * *", async () => {
//   console.log("🔄 Running next-day assignment cron...");

//   try {
//     await assignNextDayOrders();
//     console.log("✅ Orders assigned for next day");
//   } catch (error) {
//     console.error("❌ Cron Error:", error);
//   }
// });