import sql from "../../config/db.js";
import { assertPincodeBookable } from "../common/pincode.service.js";
import {
  assertValidMobile,
  createWhatsappSession,
} from "./whatsappAuth.service.js";

const PINCODE_REGEX = /^\d{6}$/;

/**
 * Split a free-text address into floor + landmark for DB columns.
 * Example: "A-204, Lotus Residency, Andheri West"
 *   → floor "A-204", landmark "Lotus Residency"
 */
export const splitCompleteAddress = (completeAddress) => {
  const text = String(completeAddress || "").replace(/\s+/g, " ").trim();
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const floor = (parts[0] || "NA").slice(0, 100);
  const landmark = (parts[1] || parts[0] || "WhatsApp address").slice(0, 255);

  return {
    complete_address: text,
    floor,
    landmark,
  };
};

/**
 * Gallabox simple add-address:
 * Required: mobile, complete_address, pincode, name, email
 * Internally fills floor/landmark/receiver/contact/lat/long, then sets default.
 */
export const addWhatsappSimpleAddress = async ({
  mobile,
  complete_address,
  pincode,
  name,
  email,
} = {}) => {
  const normalizedMobile = assertValidMobile(mobile);

  const addressText = String(complete_address || "").trim();
  if (!addressText) {
    throw { status: 400, message: "complete_address is required" };
  }

  const pin = String(pincode || "").trim();
  if (!PINCODE_REGEX.test(pin)) {
    throw { status: 400, message: "pincode must be a valid 6-digit pincode" };
  }

  const nameTrim = String(name || "").trim();
  if (!nameTrim) {
    throw { status: 400, message: "name is required" };
  }

  const emailTrim = String(email || "").trim().toLowerCase();
  if (!emailTrim) {
    throw { status: 400, message: "email is required" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
    throw { status: 400, message: "email must be a valid email address" };
  }

  await assertPincodeBookable(pin);

  // Ensure user exists (same as WhatsApp session; also issues JWT for next booking steps)
  const session = await createWhatsappSession({ mobile: normalizedMobile });
  const userId = session.data.user_id;

  const split = splitCompleteAddress(addressText);

  try {
    await sql.query(
      `UPDATE users
       SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nameTrim, emailTrim, userId],
    );
  } catch (error) {
    if (error.code === "23505") {
      throw {
        status: 400,
        message: "email is already registered with another account",
      };
    }
    throw error;
  }

  const { rows: userRows } = await sql.query(
    `SELECT full_name, email, mobile FROM users WHERE id = $1`,
    [userId],
  );
  const user = userRows[0] || {};
  const receiverName = (user.full_name || nameTrim).slice(0, 100);

  // Clear previous default, insert, set as default
  await sql.query(
    `UPDATE user_address_details
     SET is_selected = FALSE
     WHERE user_id = $1 AND is_selected = TRUE`,
    [userId],
  );

  const { rows } = await sql.query(
    `INSERT INTO user_address_details
       (user_id, address_type, complete_address, floor, landmark, receiver_name,
        contact_number, latitude, longitude, pincode, is_selected)
     VALUES ($1, 'home', $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
     RETURNING id, complete_address, floor, landmark, pincode, is_selected,
               receiver_name, contact_number`,
    [
      userId,
      split.complete_address,
      split.floor,
      split.landmark,
      receiverName,
      user.mobile || normalizedMobile,
      19.076,
      72.8777,
      pin,
    ],
  );

  const row = rows[0];

  return {
    success: true,
    message: "Address added and set as default",
    data: {
      address_id: Number(row.id),
      is_default: true,
      pincode: row.pincode,
      complete_address: row.complete_address,
      floor: row.floor,
      landmark: row.landmark,
      name: user.full_name || nameTrim,
      email: user.email || emailTrim,
      receiver_name: row.receiver_name,
      contact_number: row.contact_number,
      user_id: userId,
      customer_id: `MG-${userId}`,
      mobile: normalizedMobile,
      access_token: session.data.access_token,
      refresh_token: session.data.refresh_token,
    },
  };
};
