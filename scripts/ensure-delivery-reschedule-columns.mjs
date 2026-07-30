import 'dotenv/config';
import fs from 'fs';
import pool from '../src/config/db.js';

const sql = fs.readFileSync(
  new URL('../migrations/035_orders_delivery_reschedule.sql', import.meta.url),
  'utf8',
);

await pool.query(sql);

const { rows } = await pool.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'orders'
    AND column_name IN ('is_rescheduled', 'rescheduled_at', 'previous_delivery_date')
  ORDER BY 1
`);

console.log('columns:', rows.map((r) => r.column_name));
await pool.end();
