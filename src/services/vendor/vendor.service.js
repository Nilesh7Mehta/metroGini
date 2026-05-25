import sql from "../../config/db.js";
import { cleanupAndThrow, deleteFile } from "../../utils/file.service.js";
import { validateVendorFields } from "../../utils/vendorValidation.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BCRYPT_ROUNDS = 10;

const signVendorToken = (vendor) => {
  const access_token = jwt.sign(
    { vendor_id: vendor.id, email: vendor.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "9d" },
  );
  return {
    access_token,
    expiresIn: process.env.JWT_EXPIRES_IN || "9d",
  };
};

const validateVendorAuthInput = ({ owner_contact_name, dob, email, password }) => {
  if (!owner_contact_name?.trim()) {
    throw { status: 400, message: "owner_contact_name is required" };
  }
  if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) {
    throw { status: 400, message: "A valid email is required" };
  }
  if (!dob || !DOB_REGEX.test(dob)) {
    throw { status: 400, message: "dob must be in YYYY-MM-DD format" };
  }
  const dobDate = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(dobDate.getTime()) || dobDate > new Date()) {
    throw { status: 400, message: "dob must be a valid past date" };
  }
  if (!password || String(password).length < 6) {
    throw { status: 400, message: "password must be at least 6 characters" };
  }
};

export const addVendorService = async (body, file) => {
  const imagePath = file ? file.path : null;

  let fields;
  try {
    fields = validateVendorFields(body, { partial: false });
  } catch (err) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw err;
  }

  const {
    owner_contact_name: validatedOwner,
    mobile_number: validatedMobile,
    email: validatedEmail,
    aadhar_number: validatedAadhar,
    pan_card_number,
    gst_number,
    laundry_shop_name: validatedLaundry,
    shop_address: validatedAddress,
    account_holder_name: validatedAccountHolder,
    bank_name: validatedBank,
    account_number: validatedAccountNumber,
    ifsc_code,
    pincode: validatedPincode,
  } = fields;

  try {
    const { rows } = await sql.query(
      `INSERT INTO vendors
        (owner_contact_name, mobile_number, email, aadhar_number, pan_card_number,
         laundry_shop_name, shop_address, gst_number, account_holder_name, bank_name,
         account_number, ifsc_code, image , pincode , status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 , $14 , active)
       RETURNING *`,
      [
        validatedOwner,
        validatedMobile,
        validatedEmail,
        validatedAadhar || null,
        pan_card_number || null,
        validatedLaundry,
        validatedAddress || null,
        gst_number || null,
        validatedAccountHolder || null,
        validatedBank || null,
        validatedAccountNumber || null,
        ifsc_code || null,
        imagePath,
        validatedPincode || null,
      ],
    );
    return rows[0];
  } catch (err) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw err;
  }
};

export const updateVendorService = async (id, body, file) => {
  const newImagePath = file ? file.path : null;

  let fields;
  try {
    fields = validateVendorFields(body, { partial: true });
  } catch (err) {
    if (newImagePath) await deleteFile(newImagePath).catch(() => {});
    throw err;
  }

  if (fields.email) {
    const normalizedEmail = fields.email.trim().toLowerCase();

    const { rows } = await sql.query(
      `SELECT id FROM vendors WHERE email = $1 AND id != $2`,
      [normalizedEmail, id],
    );

    if (rows.length) {
      await cleanupAndThrow(newImagePath, "Email already exists");
    }
  }

  try {
 
    const { rows: existing } = await sql.query(
      `SELECT * FROM vendors WHERE id = $1`,
      [id]
    );

    if (!existing.length) {
      await cleanupAndThrow(newImagePath, "Vendor not found", 404);
    }

    const vendor = existing[0];

    const patch = (key) =>
      body[key] !== undefined ? (fields[key] ?? null) : null;

    const { rows } = await sql.query(
      `UPDATE vendors SET
        owner_contact_name = COALESCE($1, owner_contact_name),
        mobile_number       = COALESCE($2, mobile_number),
        email               = COALESCE($3, email),
        aadhar_number       = COALESCE($4, aadhar_number),
        pan_card_number     = COALESCE($5, pan_card_number),
        laundry_shop_name   = COALESCE($6, laundry_shop_name),
        shop_address        = COALESCE($7, shop_address),
        gst_number          = COALESCE($8, gst_number),
        account_holder_name = COALESCE($9, account_holder_name),
        bank_name           = COALESCE($10, bank_name),
        account_number      = COALESCE($11, account_number),
        ifsc_code           = COALESCE($12, ifsc_code),
        image               = COALESCE($13, image),
        pincode             = COALESCE($14, pincode),
        updated_at          = NOW()
       WHERE id = $15
       RETURNING *`,
      [
        patch("owner_contact_name"),
        patch("mobile_number"),
        body.email !== undefined
          ? fields.email?.trim().toLowerCase() ?? null
          : null,
        patch("aadhar_number"),
        patch("pan_card_number"),
        patch("laundry_shop_name"),
        patch("shop_address"),
        patch("gst_number"),
        patch("account_holder_name"),
        patch("bank_name"),
        patch("account_number"),
        patch("ifsc_code"),
        newImagePath,
        patch("pincode"),
        id,
      ],
    );

    // =========================
    // ✅ DELETE OLD IMAGE (AFTER SUCCESS)
    // =========================

    if (newImagePath && vendor.image) {
      await deleteFile(vendor.image).catch(() => {});
    }

    return rows[0];

  } catch (err) {
    if (newImagePath) {
      await deleteFile(newImagePath).catch(() => {});
    }
    throw err;
  }
};

export const registerVendorService = async ({
  owner_contact_name,
  dob,
  email,
  password,
}) => {
  validateVendorAuthInput({ owner_contact_name, dob, email, password });

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

  const { rows: existing } = await sql.query(
    `SELECT id FROM vendors WHERE LOWER(email) = $1`,
    [normalizedEmail],
  );

  if (existing.length) {
    throw { status: 409, message: "Email already registered" };
  }

  const { rows } = await sql.query(
    `INSERT INTO vendors
      (owner_contact_name, dob, email, password, status, created_at, updated_at)
     VALUES ($1, $2::date, $3, $4, 'active', NOW(), NOW())
     RETURNING id, owner_contact_name, email, dob`,
    [owner_contact_name.trim(), dob, normalizedEmail, passwordHash],
  );

  const vendor = rows[0];

  return {
    id: vendor.id,
    owner_contact_name: vendor.owner_contact_name,
    email: vendor.email,
    dob: vendor.dob,
  };
};

export const loginVendorService = async ({ email, password }) => {
  if (!email?.trim() || !EMAIL_REGEX.test(email.trim())) {
    throw { status: 400, message: "A valid email is required" };
  }
  if (!password) {
    throw { status: 400, message: "password is required" };
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { rows } = await sql.query(
    `SELECT id, email, password FROM vendors WHERE LOWER(email) = $1`,
    [normalizedEmail],
  );

  if (!rows.length) {
    throw { status: 401, message: "Invalid email or password" };
  }

  const vendor = rows[0];

  if (!vendor.password) {
    throw {
      status: 400,
      message: "Password login is not set up for this account",
    };
  }

  const passwordMatch = await bcrypt.compare(String(password), vendor.password);

  if (!passwordMatch) {
    throw { status: 401, message: "Invalid email or password" };
  }

  return signVendorToken(vendor);
};

//Login Otp (legacy)
export const loginOrVerifyVendorService = async (mobile_number) => {
  if (!mobile_number || !/^\d{10}$/.test(mobile_number)) {
    throw { status: 400, message: "mobile_number must be a 10-digit number" };
  }
    const { rows } = await sql.query(
      `SELECT * FROM vendors WHERE mobile_number = $1`,
      [mobile_number]
    );

  if (!rows.length) {
    throw { status: 404, message: "Vendor not found" };
  }

  const otp = "1234";
  const otp_expires_at = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await sql.query(
    `UPDATE vendors SET otp = $1, otp_expire = $2 WHERE mobile_number = $3`,
    [otp, otp_expires_at, mobile_number]
  );

  return { message: "OTP sent successfully" , otp };
};

export const verifyVendorOtp = async (mobile_number, otp) => {
  if (!mobile_number || !/^\d{10}$/.test(mobile_number)) {
    throw { status: 400, message: "Invalid mobile number" };
  }

  if (!otp) {
    throw { status: 400, message: "Please enter OTP" };
  }

  const { rows } = await sql.query(
    `SELECT * FROM vendors WHERE mobile_number = $1`,
    [mobile_number]
  );

  if (!rows.length) {
    throw { status: 404, message: "Vendor not found" };
  }

  const vendor = rows[0];

  if (!vendor.otp || !vendor.otp_expire) {
    throw { status: 400, message: "No OTP found or already used" };
  }

  if (vendor.otp_expire < new Date()) {
    throw { status: 400, message: "OTP expired" };
  }

  if (String(vendor.otp) !== String(otp)) {
    throw { status: 400, message: "Invalid OTP" };
  }

  const { access_token, expiresIn } = signVendorToken({
    id: vendor.id,
    email: vendor.email,
  });

  return {
    success: true,
    message: "OTP verified successfully",
    data: {
      access_token,
      expiresIn,
    },
  };
};

export const toggleVendorActiveService = async (vendor_id) => {
  const { rows: existing } = await sql.query(
    `SELECT id, is_active FROM vendors WHERE id = $1`,
    [vendor_id]
  );

  console.log(existing);

  if (!existing.length) {
    throw { status: 404, message: "Vendor not found" };
  }

  const newStatus = !existing[0].is_active;

  const { rows } = await sql.query(
    `UPDATE vendors 
     SET is_active = $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING id, is_active`,
    [newStatus, vendor_id]
  );

  return rows[0].is_active;
};

export const acceptTermsService = async (vendor_id) => {
  const { rows } = await sql.query(
    `UPDATE vendors SET is_terms_and_condition = true WHERE id = $1 RETURNING is_terms_and_condition`,
    [vendor_id],
  );

  if (rows.length === 0) throw { status: 404, message: "Vendor not found" };

  return rows[0].is_terms_and_condition_verified;
};