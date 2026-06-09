// db.js

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

// Return naive PG timestamps as strings so we always interpret them as IST wall-clock.
types.setTypeParser(1114, (value) => value);

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   ssl: false, // set true in production if needed
// });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // for development, set to true in production
  },
});

pool.on('connect', (client) => {
  client.query(`SET TIME ZONE '${APP_TIMEZONE}'`).catch((err) => {
    console.error('Failed to set database timezone:', err.message);
  });
});

export { APP_TIMEZONE };
export default pool;
