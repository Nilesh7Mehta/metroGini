/**
 * Unlock personal name+random referral codes for customers who already
 * placed a non-draft/non-cancelled order (so they can share with new users).
 *
 *   node scripts/backfill-referral-codes-prior-customers.mjs
 */
import "dotenv/config";
import sql from "../src/config/db.js";
import { backfillReferralCodesForPriorCustomers } from "../src/services/users/referral.service.js";

const results = await backfillReferralCodesForPriorCustomers();
console.log(`Unlocked ${results.length} referral code(s).`);
for (const row of results) {
  console.log(`  user ${row.user_id}: ${row.referral_code}`);
}
await sql.end();
