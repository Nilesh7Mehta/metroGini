import { findUserByMobile } from "../models/user.model.js";
import sql from "../config/db.js";
import jwt from "jsonwebtoken";
import { deleteFile } from "../utils/file.service.js";
import crypto from "crypto";
// import { generateOTP } from "../utils/otp.js";

//check if user exists by mobile
export const loginOrRegister = async (req, res, next) => {
  const { mobile } = req.body;

  try {
    let user = await findUserByMobile(mobile);

    let message;

    if (!user) {
      const { rows } = await sql.query(
        `INSERT INTO users (mobile) VALUES ($1) RETURNING *`,
        [mobile]
      );
      user = rows[0];
      message = "User registered successfully. OTP sent.";
    } else {
      message = "User found. OTP sent for login.";
    }

    // Generate OTP
    // const otp = generateOTP();
    const otp = 1234; // for testing, replace with generateOTP() in production

    // Delete old OTPs (important)
    await sql.query(
      `UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE id = $1`,
      [user.id]
    );
    
    // Insert new OTP with expiry
    await sql.query(
      `UPDATE users SET otp = $2, otp_expires_at = NOW() + INTERVAL '2 minutes' WHERE id = $1`,
      [user.id, otp]
    );

    res.status(200).json({
      success: true,
      message,
      data: {
        id: user.id,
        mobile: user.mobile,
        otp, // remove in production
        profile_completed: user.profile_completed,
      },
    });

  } catch (error) {
    next(error);
  }
};

export const verifyOTP = async (req, res, next) => {
  const { mobile, otp } = req.body;
  // console.log("Received OTP verification request for mobile:", mobile, "with OTP:", otp);

  if (!mobile || !otp) {
    return res.status(400).json({ success: false, message: "Mobile and OTP are required" });
  }

  try {
    const userResult = await sql.query(
      `SELECT * FROM users WHERE mobile = $1`,
      [mobile]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // ✅ Access Token (short expiry)
    const accessToken = jwt.sign(
      { id: user.id, mobile: user.mobile },
      process.env.JWT_SECRET,
      { expiresIn:  process.env.JWT_EXPIRES_IN || "15m" }
    );

    // ✅ Refresh Token (long expiry)
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store refresh token in DB
    await sql.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, refreshToken, expiresAt]
    );

    // Clear OTP after successful verification
    // await sql.query(
    //   `UPDATE users SET otp = NULL, otp_expires_at = NULL , is_mobile_verified = TRUE WHERE id = $1`,
    //   [user.id]
    // );

    // console.log(`User ${mobile} logged in successfully. Access Token and Refresh Token generated.`);

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: process.env.JWT_EXPIRES_IN || "15m"
      }
    });
  } catch (error) {
    next(error);
  }
};

//refresh token endpoint 
export const refreshAccessToken = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  const result = await sql.query(
    `SELECT * FROM refresh_tokens WHERE token = $1`,
    [refresh_token]
  );

  if (result.rows.length === 0) {
    return res.status(403).json({ message: "Invalid refresh token" });
  }

  const userResult = await sql.query(
    `SELECT * FROM users WHERE id = $1`,
    [result.rows[0].user_id]
  );

  const user = userResult.rows[0];

  const newAccessToken = jwt.sign(
    { id: user.id, mobile: user.mobile },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );

  res.status(200).json({
    success: true,
    message: "Access token refreshed successfully",
    access_token: newAccessToken,
    expires_in: process.env.JWT_EXPIRES_IN || "15m"
  });
};


// GET USER PROFILE
export const getProfile = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const result = await sql.query(
      `SELECT id, mobile, full_name, email, gender,
              alternate_phone, profile_completed,
              profile_image,
              terms_and_condition
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
};



//update user profile
export const updateProfile = async (req, res, next) => {
  const userId = req.user.id;
  const { full_name, email, gender, alternate_phone } = req.body;

  if (!full_name || !email || !gender || !alternate_phone) {
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }

  const allowedGenders = ["male", "female", "other"];

  if (!allowedGenders.includes(gender.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Invalid gender value"
    });
  }

  try {
    // 1️⃣ Get existing image
    const oldUser = await sql.query(
      `SELECT profile_image FROM users WHERE id = $1`,
      [userId]
    );

    if (oldUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let imagePath = oldUser.rows[0].profile_image;

    // 2️⃣ If new image uploaded
    if (req.file) {
      imagePath = `uploads/profile/${req.file.filename}`;

      // delete old image
      await deleteFile(oldUser.rows[0].profile_image);
    }

    // 3️⃣ Update profile
    const result = await sql.query(
      `UPDATE users
       SET full_name = $1,
           email = $2,
           gender = $3,
           alternate_phone = $4,
           profile_image = $5,
           profile_completed = TRUE
       WHERE id = $6
       RETURNING id, mobile, full_name, email, gender,
                 alternate_phone, profile_image,
                 profile_completed,
                 terms_and_condition`,
      [full_name, email, gender, alternate_phone, imagePath, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
};

//get Address
export const getAddress = async (req, res, next) => {
  const userId = req.user.id;
  try {
    const { rows } = await sql.query(
      `Select address_type , floor , landmark , receiver_name , contact_number , latitude , longitude , is_selected from user_address_details where user_id = $1`, [userId]
    );
    return res.status(200).json({
      success: true,
      message: "User addresses retrieved successfully",
      data: {
        addresses: rows,
      }
    });
  } catch (error) {
    next(error);
  }
};

//Add Address
export const addAddress = async (req, res, next) => {
  const userId = req.user.id;
  const { address_type, floor, landmark, receiver_name, contact_number, latitude, longitude } = req.body;
  if(!address_type || !floor || !landmark || !receiver_name || !contact_number || !latitude || !longitude){ 
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }
  const allowedTypes = ["home", "work", "institute"];

  if (!allowedTypes.includes(address_type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid address type. Allowed values: home, work, institute",
    });
  }

  try {
    const insertQuery = `
      INSERT INTO user_address_details (user_id, address_type, complete_address, floor, landmark, receiver_name, contact_number, latitude, longitude)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    const values = [userId, address_type, req.body.complete_address || null, floor, landmark, receiver_name, contact_number, latitude, longitude];
    const result = await sql.query(insertQuery, values);
    return res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: {
        address_id: result.rows[0].id
      }
    });
  } catch (error) {
    next(error);
  }
};

//Update Address
export const updateAddress = async (req, res, next) => {
  const userId = req.user.id;
  const addressId = req.params.id;
  const { address_type, floor, landmark, receiver_name, contact_number, latitude, longitude } = req.body;
  if(!address_type || !floor || !landmark || !receiver_name || !contact_number || !latitude || !longitude){ 
    return res.status(400).json({
      success: false,
      message: "All fields are required"
    });
  }
  const allowedTypes = ["home", "work", "institute"];

  if (!allowedTypes.includes(address_type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid address type. Allowed values: home, work, institute",
    });
  }

  try {
    const updateQuery = `
      UPDATE user_address_details
      SET address_type = $1, complete_address = $2, floor = $3, landmark = $4, receiver_name = $5, contact_number = $6, latitude = $7, longitude = $8
      WHERE id = $9 AND user_id = $10
      RETURNING id
    `;
    const values = [address_type, req.body.complete_address || null, floor, landmark, receiver_name, contact_number, latitude, longitude, addressId, userId];
    const result = await sql.query(updateQuery, values);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Address not found or not accessible"
      });
    }
    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: {
        address_id: result.rows[0].id
      }
    });
  } catch (error) {
    next(error);
  }
}

//Delete Address
export const deleteAddress = async (req, res, next) => {
  const userId = req.user.id;
  const addressId = req.params.id;
  try {
    const deleteQuery = `
      DELETE FROM user_address_details
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;  
    const result = await sql.query(deleteQuery, [addressId, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Address not found or not accessible"
      });
    }
    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
      data: {
        address_id: result.rows[0].id
      }
    });
  } catch (error) {
    next(error);
  }
}

//Set Default Address
export const setDefaultAddress = async (req, res, next) => {
  const userId = req.user.id;
  const addressId = req.params.id;
  try {
    // First, unset previous default address
    await sql.query(
      `UPDATE user_address_details SET is_selected = FALSE WHERE user_id = $1 AND is_selected = TRUE`,
      [userId]
    );
    // Then, set new default address
    const updateQuery = `
      UPDATE user_address_details
      SET is_selected = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const result = await sql.query(updateQuery, [addressId, userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Address not found or not accessible"
      });
    }
    return res.status(200).json({
      success: true,
      message: "Default address set successfully",
      data: {
        address_id: result.rows[0].id
      }
    });
  } catch (error) {
    next(error);
  }
}

//Terms and Condition
export const acceptTerms = async(req , res , next)=>{
  const userId = req.user.id;
  try {
    const updateQuery = `
    UPDATE users
    SET terms_and_condition = TRUE
    WHERE id= $1
    `;
    const result = await sql.query(updateQuery , [userId]);
    return res.status(200).json({
      success: true,
      message: "Terms and conditions accepted successfully",
    });
  } catch (error) {
    next(error);
  }
}

//logout
export const logout = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ message: "Refresh token required" });
  }

  await sql.query(
    `DELETE FROM refresh_tokens WHERE token = $1`,
    [refresh_token]
  );

  res.status(200).json({
    success: true,
    message: "Logged out successfully"
  });
};
