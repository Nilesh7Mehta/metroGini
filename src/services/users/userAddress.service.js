import sql from "../../config/db.js";
import { assertPincodeServiceable } from "../common/pincode.service.js";

// get Address
export const getAddress = async ({ userId }) => {
  const { rows } = await sql.query(
    `SELECT id, address_type, complete_address, floor, landmark, receiver_name,
            contact_number, latitude, longitude, pincode, is_selected
     FROM user_address_details
     WHERE user_id = $1
     ORDER BY id DESC`,
    [userId],
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "User addresses retrieved successfully",
      data: { addresses: rows || [] },
    },
  };
};

// Add Address
export const addAddress = async ({ userId, body }) => {
  const {
    address_type,
    floor,
    landmark,
    receiver_name,
    contact_number,
    latitude = "19.0760",
    longitude = "72.8777",
    pincode
  } = body;

  if (
    !address_type ||
    !floor ||
    !landmark ||
    !receiver_name ||
    !contact_number ||
    !latitude ||
    !longitude ||
    !pincode
  ) {
    return {
      statusCode: 400,
      body: { success: false, message: "All fields are required" },
    };
  }

  const allowedTypes = ["home", "work", "institute"];

  if (!allowedTypes.includes(address_type)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message:
          "Invalid address type. Allowed values: home, work, institute",
      },
    };
  }

  try {
    await assertPincodeServiceable(pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  const insertQuery = `
    INSERT INTO user_address_details
      (user_id, address_type, complete_address, floor, landmark, receiver_name, contact_number, latitude, longitude, pincode)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
  `;

  const values = [
    userId,
    address_type,
    body.complete_address || null,
    floor,
    landmark,
    receiver_name,
    contact_number,
    latitude,
    longitude,
    String(pincode).trim(),
  ];

  const result = await sql.query(insertQuery, values);

  return {
    statusCode: 201,
    body: {
      success: true,
      message: "Address added successfully",
      data: { address_id: result.rows[0].id },
    },
  };
};

// Update Address
export const updateAddress = async ({ userId, addressId, body }) => {
  const {
    address_type,
    floor,
    landmark,
    receiver_name,
    contact_number,
    latitude = "19.0760",
    longitude = "72.8777",
    pincode
  } = body;

  if (
    !address_type ||
    !floor ||
    !landmark ||
    !receiver_name ||
    !contact_number ||
    !latitude ||
    !longitude ||
    !pincode
  ) {
    return {
      statusCode: 400,
      body: { success: false, message: "All fields are required" },
    };
  }

  const allowedTypes = ["home", "work", "institute"];

  if (!allowedTypes.includes(address_type)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message:
          "Invalid address type. Allowed values: home, work, institute",
      },
    };
  }

  try {
    await assertPincodeServiceable(pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  const updateQuery = `
    UPDATE user_address_details
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
    RETURNING id
  `;

  const values = [
    address_type,
    body.complete_address || null,
    floor,
    landmark,
    receiver_name,
    contact_number,
    latitude,
    longitude,
    String(pincode).trim(),
    addressId,
    userId,
  ];

  const result = await sql.query(updateQuery, values);

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
      message: "Address updated successfully",
      data: { address_id: result.rows[0].id },
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
    await assertPincodeServiceable(existing.rows[0].pincode);
  } catch (error) {
    if (error.status) {
      return {
        statusCode: error.status,
        body: { success: false, message: error.message },
      };
    }
    throw error;
  }

  // First, unset previous default address
  await sql.query(
    `UPDATE user_address_details
     SET is_selected = FALSE
     WHERE user_id = $1 AND is_selected = TRUE`,
    [userId],
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

