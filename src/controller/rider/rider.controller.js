import sql from '../../config/db.js';
import jwt from 'jsonwebtoken';

export const loginOrVerify = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const { mobile_number } = req.body;

    const checkRider = await client.query(
      `SELECT id FROM riders WHERE mobile_number = $1`,
      [mobile_number]
    );

    let rider;

    if (checkRider.rows.length > 0) {
      rider = checkRider.rows[0];
    } else {
      const insertRider = await client.query(
        `INSERT INTO riders (mobile_number)
         VALUES ($1)
         RETURNING id, mobile_number`,
        [mobile_number]
      );

      rider = insertRider.rows[0];
    }

    const otp = 1234;

    await client.query(
      `UPDATE riders
       SET otp = $2,
           otp_expires_at = NOW() + INTERVAL '2 minutes',
           otp_attempts = 0
       WHERE id = $1`,
      [rider.id, otp]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "OTP sent successfully",
      data: {
        rider_id: rider.id,
        mobile_number,
        otp
      }
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const verifyOtp = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const { mobile_number, otp } = req.body;

    // 1️⃣ Validate input
    if (!mobile_number || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required"
      });
    }

    // 2️⃣ Get rider
    const riderResult = await client.query(
      `SELECT id, otp, otp_expires_at, otp_attempts, profile_completed
       FROM riders
       WHERE mobile_number = $1`,
      [mobile_number]
    );

    if (riderResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    const rider = riderResult.rows[0];

    // 3️⃣ OTP already verified
    if (!rider.otp) {
      return res.status(400).json({
        success: false,
        message: "OTP already used or not generated"
      });
    }

    // // 4️⃣ OTP expiry check
    // if (new Date(rider.otp_expires_at) < new Date()) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "OTP expired"
    //   });
    // }

    // 5️⃣ Max attempts check
    if (rider.otp_attempts >= 5) {
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new OTP."
      });
    }

    // 6️⃣ OTP mismatch
    if (rider.otp != otp) {

      await client.query(
        `UPDATE riders
         SET otp_attempts = otp_attempts + 1
         WHERE id = $1`,
        [rider.id]
      );

      await client.query("COMMIT");

      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // 7️⃣ Clear OTP after success
    // await client.query(
    //   `UPDATE riders
    //    SET otp = NULL,
    //        otp_expires_at = NULL,
    //        otp_attempts = 0
    //    WHERE id = $1`,
    //   [rider.id]
    // );

    // 8️⃣ Generate JWT token
    const access_token = jwt.sign(
      { rider_id: rider.id, mobile_number },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      access_token,
      data: {
        rider_id: rider.id,
        mobile_number,
        profile_completed: rider.profile_completed
      }
    });

  } catch (error) {
    next(error);

  }
};
