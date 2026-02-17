import postgres from 'postgres'
import dotenv from 'dotenv';

dotenv.config();
const connectionString = process.env.DEV_DATABASE_URL
const sql = postgres(connectionString,{
    ssl: false,
})

async function testConnection() {
  try {
    await sql`SELECT 1`;
    console.log("✅ Database connected successfully!");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
}

testConnection();
export default sql
