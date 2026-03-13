import sql from '../../config/db.js';
import jwt from 'jsonwebtoken';
import { deleteFile } from '../../utils/file.service.js';
import { getImageUrl } from '../../utils/getImageUrl.js';
import { assignOrdersToRider } from '../../models/riders/orderSplit.model.js';
import { checkRiderReady } from '../../models/riders/rider.model.js';

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

//choose shift
export const chooseShift = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const { shift_id } = req.body;

    if (!shift_id) {
      return res.status(400).json({
        success: false,
        message: "Shift is required",
      });
    }

    // 1️⃣ Check shift exists
    const shiftResult = await sql.query(
      `SELECT shift_name FROM shifts WHERE id = $1`,
      [shift_id]
    );

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shift not found",
      });
    }

    const shiftName = shiftResult.rows[0].shift_name;

    // 2️⃣ Update rider shift
    await sql.query(
      `UPDATE riders 
       SET shift_id = $1, shift_started_at = NOW() 
       WHERE id = $2`,
      [shift_id, rider_id]
    );

    return res.status(200).json({
      success: true,
      message: `Shift confirmed! You have selected ${shiftName}`,
    });

  } catch (error) {
    next(error);
  }
};

// export const goActive1 = async (req, res, next) => {
//   try {
//     const rider_id = req.user.rider_id;

//     // Get current status
//     const { rows } = await sql.query(
//       `SELECT is_active FROM riders WHERE id = $1`,
//       [rider_id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "Rider not found"
//       });
//     }

//     const currentStatus = rows[0].is_active;

//     // Toggle status
//     const { rows: updated } = await sql.query(
//       `UPDATE riders
//        SET is_active = $1
//        WHERE id = $2
//        RETURNING is_active`,
//       [!currentStatus, rider_id]
//     );

//     res.status(200).json({
//       success: true,
//       message: updated[0].is_active
//         ? "Rider is now Online"
//         : "Rider is now Offline",
//       is_active: updated[0].is_active
//     });

//   } catch (error) {
//     next(error);
//   }
// };

export const goActive = async (req, res, next) => {
  try {

    const rider_id = req.user.rider_id;

    const { rows } = await sql.query(
      `SELECT is_active FROM riders WHERE id = $1`,
      [rider_id]
    );

    const currentStatus = rows[0].is_active;
    const newStatus = !currentStatus;

    await sql.query(
      `UPDATE riders
       SET is_active = $1
       WHERE id = $2`,
      [newStatus, rider_id]
    );

    // If going online
    if (newStatus) {

      const ready = await checkRiderReady(rider_id);

      if (!ready) {
        return res.status(400).json({
          success: false,
          message: "Please select shift first"
        });
      }

      const assignedOrders = await assignOrdersToRider(rider_id);

      return res.status(200).json({
        success: true,
        message: "Rider is now online",
        assigned_orders: assignedOrders.length
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rider is now offline"
    });

  } catch (error) {
    next(error);
  }
};

export const acceptTerms = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;

    const { rows } = await sql.query(
      `UPDATE riders
       SET is_terms_and_condition_verified = true
       WHERE id = $1
       RETURNING is_terms_and_condition_verified`,
      [rider_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Terms and Conditions accepted successfully",
      is_terms_and_condition_verified: rows[0].is_terms_and_condition_verified
    });

  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const rider_id = req.user.rider_id;
    console.log("Rider id", rider_id);

    if (!rider_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const {
      full_name,
      alternate_contact_number,
      aadhaar_number,
      pan_card_number,
      date_of_birth,
      residential_address,
      vehicle_type,
      vehicle_registration_number,
      licence_validity_date,
      account_holder_name,
      bank_name,
      account_number,
      ifsc_code
    } = req.body;

    // ---- Get existing image ----
    const rider = await client.query(
      "SELECT image FROM riders WHERE id = $1",
      [rider_id]
    );

    if (!rider.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }

    let imagePath = rider.rows[0].image;

    // ---- If new image uploaded ----
    if (req.file) {
      if (imagePath) {
        await deleteFile(imagePath);
      }

      imagePath = req.file.path;
    }

    // ---- Update query ----
    const updatedRider = await client.query(
      `UPDATE riders SET
        full_name = $1,
        alternate_contact_number = $2,
        aadhaar_number = $3,
        pan_card_number = $4,
        date_of_birth = $5,
        residential_address = $6,
        vehicle_type = $7,
        vehicle_registration_number = $8,
        licence_validity_date = $9,
        account_holder_name = $10,
        bank_name = $11,
        account_number = $12,
        ifsc_code = $13,
        image = $14,
        status = 'active',
        profile_completed = true
      WHERE id = $15
      RETURNING *`,
      [
        full_name,
        alternate_contact_number,
        aadhaar_number,
        pan_card_number,
        date_of_birth,
        residential_address,
        vehicle_type,
        vehicle_registration_number,
        licence_validity_date,
        account_holder_name,
        bank_name,
        account_number,
        ifsc_code,
        imagePath,
        rider_id
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully"
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;

    if (!rider_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const { rows } = await sql.query(
      `SELECT * FROM riders WHERE id = $1`,
      [rider_id]
    );

    const rider = rows[0];

    rider.image = getImageUrl(req, rider.image);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Rider not found"
      });
    }


    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data:rider
    });

  } catch (error) {
    next(error);
  }
};

export const needHelp = async (req, res, next) => {
  try {
    const rider_id = req.user.rider_id;
    const { report_issue, message } = req.body;

    if (!report_issue) {
      return res.status(400).json({
        message: "Report issue is required"
      });
    }

    if (!message) {
      return res.status(400).json({
        message: "Message field is required"
      });
    }

    const { rows } = await sql.query(
      `INSERT INTO rider_helpline (rider_id, report_issue, message)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [rider_id, report_issue, message.trim()]
    );

    res.status(200).json({
      status: true,
      message: "Support request submitted successfully",
      data: rows[0]
    });

  } catch (error) {
    next(error);
  }
};
 