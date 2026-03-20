import sql from "../../config/db.js";
import jwt from "jsonwebtoken";
import { deleteFile } from "../../utils/file.service.js";
import { getImageUrl } from "../../utils/getImageUrl.js";
import { checkRiderReady } from "../../models/riders/rider.model.js";

export const loginOrVerifyService = async (mobile_number) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const checkRider = await client.query(
      `SELECT id FROM riders WHERE mobile_number = $1`,
      [mobile_number],
    );

    let rider =
      checkRider.rows.length > 0
        ? checkRider.rows[0]
        : (
            await client.query(
              `INSERT INTO riders (mobile_number) VALUES ($1) RETURNING id, mobile_number`,
              [mobile_number],
            )
          ).rows[0];

    const otp = 1234;

    await client.query(
      `UPDATE riders SET otp = $2, otp_expires_at = NOW() + INTERVAL '2 minutes', otp_attempts = 0 WHERE id = $1`,
      [rider.id, otp],
    );

    await client.query("COMMIT");
    return { rider_id: rider.id, mobile_number, otp };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const verifyOtpService = async (mobile_number, otp) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const riderResult = await client.query(
      `SELECT id, otp, otp_expires_at, otp_attempts, profile_completed FROM riders WHERE mobile_number = $1`,
      [mobile_number],
    );

    if (riderResult.rows.length === 0)
      throw { status: 404, message: "Rider not found" };

    const rider = riderResult.rows[0];

    if (!rider.otp)
      throw { status: 400, message: "OTP already used or not generated" };
    if (rider.otp_attempts >= 5)
      throw {
        status: 429,
        message: "Too many incorrect attempts. Request a new OTP.",
      };

    if (rider.otp != otp) {
      await client.query(
        `UPDATE riders SET otp_attempts = otp_attempts + 1 WHERE id = $1`,
        [rider.id],
      );
      await client.query("COMMIT");
      throw { status: 400, message: "Invalid OTP" };
    }

    const access_token = jwt.sign(
      { rider_id: rider.id, mobile_number },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
    );

    await client.query("COMMIT");
    return {
      access_token,
      rider_id: rider.id,
      mobile_number,
      profile_completed: rider.profile_completed,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const chooseShiftService = async (rider_id, shift_id) => {
  const shiftResult = await sql.query(
    `SELECT shift_name FROM shifts WHERE id = $1`,
    [shift_id],
  );

  if (shiftResult.rows.length === 0)
    throw { status: 404, message: "Shift not found" };

  const shiftName = shiftResult.rows[0].shift_name;

  await sql.query(
    `UPDATE riders SET shift_id = $1, shift_started_at = NOW() WHERE id = $2`,
    [shift_id, rider_id],
  );

  return shiftName;
};

export const goActiveService = async (rider_id) => {
  const { rows } = await sql.query(
    `SELECT is_active FROM riders WHERE id = $1`,
    [rider_id],
  );

  const newStatus = !rows[0].is_active;

  await sql.query(`UPDATE riders SET is_active = $1 WHERE id = $2`, [
    newStatus,
    rider_id,
  ]);

  if (newStatus) {
    const ready = await checkRiderReady(rider_id);
    if (!ready) throw { status: 400, message: "Please select shift first" };
  }

  return newStatus;
};

export const acceptTermsService = async (rider_id) => {
  const { rows } = await sql.query(
    `UPDATE riders SET is_terms_and_condition_verified = true WHERE id = $1 RETURNING is_terms_and_condition_verified`,
    [rider_id],
  );

  if (rows.length === 0) throw { status: 404, message: "Rider not found" };

  return rows[0].is_terms_and_condition_verified;
};

export const updateProfileService = async (rider_id, body, file) => {
  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    const rider = await client.query(`SELECT image FROM riders WHERE id = $1`, [
      rider_id,
    ]);

    if (!rider.rows.length) throw { status: 404, message: "Rider not found" };

    let imagePath = rider.rows[0].image;

    if (file) {
      if (imagePath) await deleteFile(imagePath);
      imagePath = file.path;
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
      ifsc_code,
    } = body;

    await client.query(
      `UPDATE riders SET
        full_name=$1, alternate_contact_number=$2, aadhaar_number=$3, pan_card_number=$4,
        date_of_birth=$5, residential_address=$6, vehicle_type=$7, vehicle_registration_number=$8,
        licence_validity_date=$9, account_holder_name=$10, bank_name=$11, account_number=$12,
        ifsc_code=$13, image=$14, status='active', profile_completed=true
      WHERE id=$15`,
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
        rider_id,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getProfileService = async (rider_id, req) => {
  const { rows } = await sql.query(`SELECT * FROM riders WHERE id = $1`, [
    rider_id,
  ]);

  if (!rows.length) throw { status: 404, message: "Rider not found" };

  const rider = rows[0];
  rider.image = getImageUrl(req, rider.image);
  return rider;
};

export const needHelpService = async (rider_id, report_issue, message) => {
  const { rows } = await sql.query(
    `INSERT INTO rider_helpline (rider_id, report_issue, message) VALUES ($1, $2, $3) RETURNING *`,
    [rider_id, report_issue, message.trim()],
  );
  return rows[0];
};
