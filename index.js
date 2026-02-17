import app from "./src/app.js";
import dotenv from "dotenv";
import pool from "./src/config/db.js";   // adjust path if needed

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test DB connection
    await pool.query("SELECT 1");

    console.log("✅ Database Connected Successfully");

    // Start server only after DB connects
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Database Connection Failed:", error);
    process.exit(1); // Stop app if DB fails
  }
};

startServer();
