/**
 * One-shot: rewrite every personal referral code to name+random
 * (e.g. NILESH7K2M), including any leftover USER## codes.
 *
 *   node scripts/migrate-referral-codes-name-random.mjs
 */
import "dotenv/config";
import sql from "../src/config/db.js";
import { migrateAllReferralCodesToNameRandom } from "../src/services/users/referral.service.js";

const changed = await migrateAllReferralCodesToNameRandom();
console.log(`Updated ${changed.length} referral code(s).`);
for (const row of changed) {
  console.log(`  user ${row.user_id}: ${row.from} → ${row.to}`);
}
await sql.end();
