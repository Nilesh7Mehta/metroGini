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

const fetchProfileRow = async (userId) => {
  const { rows } = await sql.query(
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
     LEFT JOIN LATERAL (
       SELECT pincode
       FROM user_address_details
       WHERE user_id = u.id
       ORDER BY is_selected DESC NULLS LAST, id DESC
       LIMIT 1
     ) ua ON TRUE
     LEFT JOIN pincodes p ON p.pincode = ua.pincode
     LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     WHERE u.id = $1`,
    [userId],
  );
  return rows[0] || null;
};

// GET USER PROFILE
export const getProfile = async ({ req, userId }) => {
  const row = await fetchProfileRow(userId);

  if (!row) {
    return {
      statusCode: 404,
      body: { success: false, message: "User not found" },
    };
  }

  const user = mapProfileRow(row);
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

  if (!full_name?.trim()) {
    return {
      statusCode: 400,
      body: { success: false, message: "full_name is required" },
    };
  }

  if (!email?.trim()) {
    return {
      statusCode: 400,
      body: { success: false, message: "email is required" },
    };
  }

  if (!gender?.trim()) {
    return {
      statusCode: 400,
      body: { success: false, message: "gender is required" },
    };
  }

  const allowedGenders = ["male", "female", "other"];
  const normalizedGender = String(gender).trim().toLowerCase();

  if (!allowedGenders.includes(normalizedGender)) {
    return {
      statusCode: 400,
      body: { success: false, message: "Invalid gender value" },
    };
  }

  const resolvedAlternatePhone =
    alternate_phone != null && String(alternate_phone).trim() !== ""
      ? String(alternate_phone).trim()
      : null;

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
  await sql.query(
    `UPDATE users
     SET full_name = $1,
         email = $2,
         gender = $3,
         alternate_phone = $4,
         profile_image = $5,
         profile_completed = TRUE
     WHERE id = $6`,
    [
      String(full_name).trim(),
      String(email).trim(),
      normalizedGender,
      resolvedAlternatePhone,
      imagePath,
      userId,
    ],
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

  const profileRow = await fetchProfileRow(userId);

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Profile updated successfully",
      data: mapProfileRow(profileRow),
    },
  };
};
