import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(
  "ALTER TABLE public.time_slots ADD COLUMN IF NOT EXISTS shift_name VARCHAR(50)"
);
const cols = await client.query(
  `SELECT column_name
   FROM information_schema.columns
   WHERE table_name = 'time_slots'
   ORDER BY ordinal_position`
);
console.log(cols.rows.map((r) => r.column_name).join(", "));
await client.end();
