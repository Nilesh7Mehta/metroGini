import sql from "../../src/config/db.js";

/**
 * Insert notifications in batch.
 * Each notification must have:
 *   identity_id  — the id of the recipient (user.id, vendor.id, rider.id)
 *   role         — 'user' | 'vendor' | 'rider'
 *   title        — string
 *   message      — string
 *   reference_type (optional) — 'order' | 'rider' | etc.
 *   reference_id   (optional) — related record id
 */
export const createNotificationsBatch = async (notifications) => {
  try {
    for (const n of notifications) {
      await sql.query(
        `INSERT INTO notifications
         (identity_id, role, title, message, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          n.identity_id,
          n.role,
          n.title,
          n.message,
          n.reference_type || null,
          n.reference_id || null,
        ]
      );
    }
  } catch (error) {
    console.error("Notification batch error:", error);
  }
};
