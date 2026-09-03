import sql from "../../config/db.js";
import { assertPincodeBookable } from "../common/pincode.service.js";

const ALLOWED_ADDRESS_TYPES = ["home", "work", "institute"];

const getUserNameEmail = async (userId) => {
  const { rows } = await sql.query(
    `SELECT full_name, email FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0] || {};
  return {
    name: user.full_name || null,
    email: user.email || null,
  };
};

/**
 * Sync name/email onto users table (one profile for many addresses).
 * Only updates fields that are explicitly sent as non-empty values.
 */
const syncUserNameEmail = async ({ userId, name, email }) => {
  const fields = [];
  const values = [];
  let index = 1;

  if (name != null && String(name).trim() !== "") {
    fields.push(`full_name = $${index++}`);
    values.push(String(name).trim());
  }

  if (email != null && String(email).trim() !== "") {
    fields.push(`email = $${index++}`);
    values.push(String(email).trim().toLowerCase());
  }

  if (!fields.length) return null;

  values.push(userId);

  try {
    const { rows } = await sql.query(
      `UPDATE users
       SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${index}
       RETURNING full_name, email`,
      values,
    );
    return {
      name: rows[0]?.full_name || null,
      email: rows[0]?.email || null,
    };
  } catch (error) {
    if (error.code === "23505") {
      throw {
        status: 400,
        message: "email is already registered with another account",
      };
    }
    throw error;
  }
};

const validateAddressBody = (body) => {
  const {
    address_type,
    floor,
    landmark,
    name,
    receiver_name,
    contact_number,
    latitude = "19.0760",
    longitude = "72.8777",
    pincode,
    email,
    complete_address,
  } = body;

  const resolvedReceiverName = String(receiver_name || name || "").trim();

  if (!address_type?.toString().trim()) {
    return { error: "address_type is required" };
  }
  if (!floor?.toString().trim()) {
    return { error: "floor is required" };
  }
  if (!landmark?.toString().trim()) {
    return { error: "landmark is required" };
  }
  if (!resolvedReceiverName) {
    return { error: "receiver_name (or name) is required" };
  }
  if (!contact_number?.toString().trim()) {
    return { error: "contact_number is required" };
  }
  if (!latitude?.toString().trim()) {
    return { error: "latitude is required" };
  }
  if (!longitude?.toString().trim()) {
    return { error: "longitude is required" };
  }
  if (!pincode?.toString().trim()) {
    return { error: "pincode is required" };
  }
  if (!ALLOWED_ADDRESS_TYPES.includes(address_type)) {
    return {
      error: "Invalid address type. Allowed values: home, work, institute",
    };
  }

  return {
    data: {
      address_type,
      floor: String(floor).trim(),
      landmark: String(landmark).trim(),
      receiver_name: resolvedReceiverName,
      contact_number: String(contact_number).trim(),
      latitude,
      longitude,
      pincode: String(pincode).trim(),
      complete_address: complete_address || null,
      name: name != null ? String(name).trim() : null,
      email: email != null ? String(email).trim() : null,
    },
  };
};

// get Address — includes users.name/email once for prefilling add/edit forms
export const getAddress = async ({ userId }) => {
  const [{ rows }, profile] = await Promise.all([
    sql.query(
      `SELECT id, address_type, complete_address, floor, landmark, receiver_name,
              contact_number, latitude, longitude, pincode, is_selected
       FROM user_address_details
       WHERE user_id = $1
       ORDER BY id DESC`,
      [userId],
    ),
    getUserNameEmail(userId),
  ]);

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "User addresses retrieved successfully",
      data: {
        name: profile.name,
        email: profile.email,
        addresses: rows || [],
      },
    },
  };
};

// Add Address
export const addAddress = async ({ userId, body }) => {
  const validated = validateAddressBody(body);
  if (validated.error) {
    return {
      statusCode: 400,
      body: { success: false, message: validated.error },
    };
  }

  const payload = validated.data;

  try {
    await assertPincodeBookable(payload.pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  let profile;
  try {
    profile = await syncUserNameEmail({
      userId,
      name: payload.name,
      email: payload.email,
    });
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  const result = await sql.query(
    `INSERT INTO user_address_details
       (user_id, address_type, complete_address, floor, landmark, receiver_name,
        contact_number, latitude, longitude, pincode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      userId,
      payload.address_type,
      payload.complete_address,
      payload.floor,
      payload.landmark,
      payload.receiver_name,
      payload.contact_number,
      payload.latitude,
      payload.longitude,
      payload.pincode,
    ],
  );

  if (!profile) {
    profile = await getUserNameEmail(userId);
  }

  return {
    statusCode: 201,
    body: {
      success: true,
      message: "Address added successfully",
      data: {
        address_id: result.rows[0].id,
        name: profile.name,
        email: profile.email,
      },
    },
  };
};

// Update Address
export const updateAddress = async ({ userId, addressId, body }) => {
  const validated = validateAddressBody(body);
  if (validated.error) {
    return {
      statusCode: 400,
      body: { success: false, message: validated.error },
    };
  }

  const payload = validated.data;

  try {
    await assertPincodeBookable(payload.pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  let profile;
  try {
    profile = await syncUserNameEmail({
      userId,
      name: payload.name,
      email: payload.email,
    });
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  const result = await sql.query(
    `UPDATE user_address_details
     SET address_type = $1,
         complete_address = $2,
         floor = $3,
         landmark = $4,
         receiver_name = $5,
         contact_number = $6,
         latitude = $7,
         longitude = $8,
         pincode = $9
     WHERE id = $10 AND user_id = $11
     RETURNING id`,
    [
      payload.address_type,
      payload.complete_address,
      payload.floor,
      payload.landmark,
      payload.receiver_name,
      payload.contact_number,
      payload.latitude,
      payload.longitude,
      payload.pincode,
      addressId,
      userId,
    ],
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "Address not found or not accessible" },
    };
  }

  if (!profile) {
    profile = await getUserNameEmail(userId);
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Address updated successfully",
      data: {
        address_id: result.rows[0].id,
        name: profile.name,
        email: profile.email,
      },
    },
  };
};

// Delete Address
export const deleteAddress = async ({ userId, addressId }) => {
  const deleteQuery = `
    DELETE FROM user_address_details
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `;

  const result = await sql.query(deleteQuery, [addressId, userId]);

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "Address not found or not accessible" },
    };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Address deleted successfully",
      data: { address_id: result.rows[0].id },
    },
  };
};

// Set Default Address
export const setDefaultAddress = async ({ userId, addressId }) => {
  const existing = await sql.query(
    `SELECT pincode FROM user_address_details WHERE id = $1 AND user_id = $2`,
    [addressId, userId],
  );
  if (existing.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "Address not found or not accessible" },
    };
  }

  try {
    await assertPincodeBookable(existing.rows[0].pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  await sql.query(
    `UPDATE user_address_details
     SET is_selected = FALSE
     WHERE user_id = $1 AND is_selected = TRUE`,
    [userId],
  );

  const result = await sql.query(
    `UPDATE user_address_details
     SET is_selected = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [addressId, userId],
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, message: "Address not found or not accessible" },
    };
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "Default address set successfully",
      data: { address_id: result.rows[0].id },
    },
  };
};
