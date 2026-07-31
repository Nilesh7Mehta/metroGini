import 'dotenv/config';
import pool from '../src/config/db.js';
import { APP_TIMEZONE } from '../src/config/db.js';
import { getNextWorkDateAfter } from '../src/services/common/laundryGroupShiftSchedule.service.js';
import { rescheduleOverdueDeliveries } from '../src/cron/deliveryRescheduleCron.js';

const PENDING = ['in_process', 'order_finalized'];

console.log('Timezone:', APP_TIMEZONE);
console.log('--- Eligible BEFORE ---');

const before = await pool.query(
  `
  SELECT
    o.id,
    o.vendor_id,
    o.status,
    TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
    o.is_rescheduled,
    TO_CHAR(o.previous_delivery_date, 'YYYY-MM-DD') AS previous_delivery_date,
    o.vendor_received_at IS NOT NULL AS received
  FROM orders o
  WHERE o.vendor_id IS NOT NULL
    AND o.vendor_received_at IS NOT NULL
    AND o.delivery_date IS NOT NULL
    AND o.delivery_date < (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
    AND o.status = ANY($2::text[])
  ORDER BY o.id
  LIMIT 20
  `,
  [APP_TIMEZONE, PENDING],
);

console.log(before.rows);

if (before.rows.length === 0) {
  console.log('\nNo eligible overdue orders. Creating a temporary test case if possible...');

  const candidate = await pool.query(
    `
    SELECT o.id, o.vendor_id, o.status,
           TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date
    FROM orders o
    WHERE o.vendor_id IS NOT NULL
      AND o.vendor_received_at IS NOT NULL
      AND o.status = ANY($1::text[])
    ORDER BY o.id DESC
    LIMIT 1
    `,
    [PENDING],
  );

  if (!candidate.rows.length) {
    console.log('No in_process/order_finalized + vendor_received_at orders found. Cannot seed.');
  } else {
    const row = candidate.rows[0];
    const next = await getNextWorkDateAfter(row.vendor_id, '2026-07-01');
    console.log('Candidate:', row, 'sample next after 2026-07-01:', next);

    await pool.query(
      `
      UPDATE orders
      SET delivery_date = CURRENT_DATE - 1,
          is_rescheduled = false,
          previous_delivery_date = NULL,
          rescheduled_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [row.id],
    );
    console.log(`Seeded order #${row.id}: delivery_date = yesterday`);
  }
}

console.log('\n--- Running cron ---');
const result = await rescheduleOverdueDeliveries();
console.log('Result:', result);

console.log('\n--- Sample AFTER (recently rescheduled) ---');
const after = await pool.query(
  `
  SELECT
    o.id,
    o.vendor_id,
    o.status,
    TO_CHAR(o.delivery_date, 'YYYY-MM-DD') AS delivery_date,
    o.is_rescheduled,
    TO_CHAR(o.previous_delivery_date, 'YYYY-MM-DD') AS previous_delivery_date,
    o.rescheduled_at
  FROM orders o
  WHERE o.is_rescheduled = true
  ORDER BY o.rescheduled_at DESC NULLS LAST, o.id DESC
  LIMIT 10
  `,
);

console.log(after.rows);
await pool.end();
process.exit(0);
