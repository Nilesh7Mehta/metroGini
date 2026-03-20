import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";

// GET USER PROFILE
export const getProfile = async ({ req, userId }) => {
  const result = await sql.query(
    `SELECT id, mobile, full_name, email, gender,
            alternate_phone, profile_completed,
            profile_image,
            terms_and_condition , push_notification 
     FROM users
     WHERE id = $1`,
    [userId],
  );

  // Keep the same ordering as the old controller (image mapping before empty check).
  const user = result.rows[0];
  user.image = getImageUrl(req, user.profile_image);

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found" },
    };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Profile fetched successfully",
      data: result.rows[0],
    },
  };
};

// update user profile
export const updateProfile = async ({ userId, body, file }) => {
  const { full_name, email, gender, alternate_phone } = body;

  if (!full_name || !email || !gender || !alternate_phone) {
    return {
      statusCode: 400,
      body: { success: false, message: "All fields are required" },
    };
  }

  const allowedGenders = ["male", "female", "other"];

  if (!allowedGenders.includes(gender.toLowerCase())) {
    return {
      statusCode: 400,
      body: { success: false, message: "Invalid gender value" },
    };
  }

  // 1️⃣ Get existing image
  const oldUser = await sql.query(
    `SELECT profile_image FROM users WHERE id = $1`,
    [userId],
  );

  if (oldUser.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found" },
    };
  }

  let imagePath = oldUser.rows[0].profile_image;

  // 2️⃣ If new image uploaded
  if (file) {
    imagePath = `uploads/profile/${file.filename}`;

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
    [full_name, email, gender, alternate_phone, imagePath, userId],
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0],
    },
  };
};

