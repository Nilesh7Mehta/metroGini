// db.js

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// Return PostgreSQL timestamp without timezone as string
types.setTypeParser(1114, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set timezone whenever a new connection is established
pool.on('connect', async (client) => {
  try {
    await client.query(`SET TIME ZONE '${APP_TIMEZONE}'`);
    console.log(`✅ Database connected (Timezone: ${APP_TIMEZONE})`);
  } catch (err) {
    console.error('❌ Failed to set database timezone:', err.message);
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error:', err);
});

export { APP_TIMEZONE };
export default pool;