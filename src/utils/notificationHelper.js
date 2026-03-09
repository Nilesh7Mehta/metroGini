import  sql  from "../../src/config/db.js";

export const createNotificationsBatch = async (notifications) => {
  try {
    for (const n of notifications) {
      await sql.query(
        `INSERT INTO notifications
         (user_id, title, message, reference_type, reference_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          n.user_id,
          n.title,
          n.message,
          n.reference_type || null,
          n.reference_id || null,
        ]
      );
    }

    // Later we can send FCM push here also

  } catch (error) {
    console.error("Notification batch error:", error);
  }
};