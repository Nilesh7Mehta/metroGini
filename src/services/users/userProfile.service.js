import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";
import { formatUserOrder } from "../../utils/userOrder.util.js";
import { createNotificationsBatch } from "../../utils/notificationHelper.js";
import { accountCreatedTemplate } from "../../utils/userNotificationTemplates.js";
import { getCurrentUserOrdersService } from "./userOrder.service.js";

const mapProfileRow = (row) => ({
  id: row.id,
  mobile: row.mobile,
  full_name: row.full_name,
  email: row.email,
  gender: row.gender,
  alternate_phone: row.alternate_phone,
  profile_completed: row.profile_completed,
  profile_image: row.profile_image,
  terms_and_condition: row.terms_and_condition,
  push_notification: row.push_notification,
  pincode: row.pincode ?? null,
  pincode_serviceable: row.pincode_serviceable ?? null,
  pincode_group: row.pincode_group_id
    ? {
        id: row.pincode_group_id,
        group_code: row.pincode_group_code,
        name: row.pincode_group_name,
        status: row.pincode_group_status,
      }
    : null,
});

// GET USER PROFILE
export const getProfile = async ({ req, userId }) => {
  const result = await sql.query(
    `SELECT u.id, u.mobile, u.full_name, u.email, u.gender,
            u.alternate_phone, u.profile_completed,
            u.profile_image,
            u.terms_and_condition, u.push_notification,
            ua.pincode,
            p.serviceable AS pincode_serviceable,
            pg.id AS pincode_group_id,
            pg.group_code AS pincode_group_code,
            pg.name AS pincode_group_name,
            pg.status AS pincode_group_status
     FROM users u
     LEFT JOIN user_address_details ua
       ON ua.user_id = u.id AND ua.is_selected = TRUE
     LEFT JOIN pincodes p ON p.pincode = ua.pincode
     LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     WHERE u.id = $1`,
    [userId],
  );
  // Check if user exists first before processing
  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found" },
    };
  }

  const user = mapProfileRow(result.rows[0]);
  const currentOrders = await getCurrentUserOrdersService({ user_id: userId });

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Profile fetched successfully",
      data: {
        ...user,
        current_orders: currentOrders.map(formatUserOrder),
      },
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

  const normalizedGender = gender.toLowerCase();

  if (!allowedGenders.includes(normalizedGender)) {
    return {
      statusCode: 400,
      body: { success: false, message: "Invalid gender value" },
    };
  }

  // 1️⃣ Get existing image + profile state
  const oldUser = await sql.query(
    `SELECT profile_image, profile_completed FROM users WHERE id = $1`,
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

  const wasProfileIncomplete = !oldUser.rows[0].profile_completed;

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
    [full_name, email, normalizedGender, alternate_phone, imagePath, userId],
  );

  if (wasProfileIncomplete) {
    const welcome = accountCreatedTemplate({ name: full_name });
    await createNotificationsBatch([
      {
        identity_id: userId,
        role: "user",
        title: welcome.title,
        message: welcome.message,
        reference_type: "auth",
        reference_id: userId,
        data: welcome.data,
      },
    ]);
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Profile updated successfully",
      data: result.rows[0],
    },
  };
};

