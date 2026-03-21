import sql from "../../config/db.js";
import { cleanupAndThrow, deleteFile } from "../../utils/file.service.js";

export const addVendorService = async (body, file) => {
  const {
    owner_contact_name,
    mobile_number,
    email,
    aadhar_number,
    laundry_shop_name,
    shop_address,
    account_holder_name,
    bank_name,
    account_number,
    pincode,
  } = body;

  const pan_card_number = body.pan_card_number?.toUpperCase();
  const gst_number = body.gst_number?.toUpperCase();
  const ifsc_code = body.ifsc_code?.toUpperCase();

  const imagePath = file ? file.path : null;

  if (!owner_contact_name || !mobile_number || !email || !laundry_shop_name) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw {
      status: 400,
      message:
        "owner_contact_name, mobile_number, email and laundry_shop_name are required",
    };
  }
  if (!mobile_number ||!/^\d{10}$/.test(mobile_number)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw { status: 400, message: "mobile_number must be a 10-digit number" };
  }
  // Email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw { status: 400, message: "email must be a valid email address" };
  }

  // Aadhar: exactly 12 digits
  if (aadhar_number && !/^\d{12}$/.test(aadhar_number)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw { status: 400, message: "aadhar_number must be exactly 12 digits" };
  }

  // PAN: 5 uppercase letters, 4 digits, 1 uppercase letter
  if (pan_card_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_card_number)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw {
      status: 400,
      message: "pan_card_number must be in valid format (e.g. ABCDE1234F) ",
    };
  }

  // GST: 15-character alphanumeric, all uppercase
  if (gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst_number)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw {
      status: 400,
      message: "gst_number must be a valid 15-character GST number (e.g. 22ABCDE1234F1Z5)",
    };
  }
  // Account number: 9–18 digits
  if (account_number && !/^\d{9,18}$/.test(account_number)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw {
      status: 400,
      message: "account_number must be a valid numeric bank account number (9–18 digits)",
    };
  }

  // IFSC: 4 uppercase letters, 0, then 6 alphanumeric chars
  if (ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw {
      status: 400,
      message: "ifsc_code must be a valid IFSC code (e.g. SBIN0001234) in uppercase",
    };
  }

  // Pincode: exactly 6 digits
  if (pincode && !/^\d{6}$/.test(pincode)) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw { status: 400, message: "pincode must be a valid 6-digit pincode" };
  }

  try {
    const { rows } = await sql.query(
      `INSERT INTO vendors
        (owner_contact_name, mobile_number, email, aadhar_number, pan_card_number,
         laundry_shop_name, shop_address, gst_number, account_holder_name, bank_name,
         account_number, ifsc_code, image , pincode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13 , $14)
       RETURNING *`,
      [
        owner_contact_name,
        mobile_number,
        email.trim(),
        aadhar_number || null,
        pan_card_number || null,
        laundry_shop_name,
        shop_address || null,
        gst_number || null,
        account_holder_name || null,
        bank_name || null,
        account_number || null,
        ifsc_code || null,
        imagePath,
        pincode || null,
      ],
    );
    return rows[0];
  } catch (err) {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
    throw err;
  }
};

export const updateVendorService = async (id, body, file) => {
  const {
    owner_contact_name,
    mobile_number,
    email,
    aadhar_number,
    laundry_shop_name,
    shop_address,
    account_holder_name,
    bank_name,
    account_number,
    pincode,
  } = body;

  const pan_card_number = body.pan_card_number?.toUpperCase();
  const gst_number = body.gst_number?.toUpperCase();
  const ifsc_code = body.ifsc_code?.toUpperCase();

  const newImagePath = file ? file.path : null;

  if (mobile_number && !/^\d{10}$/.test(mobile_number)) {
    await cleanupAndThrow(newImagePath , newImagePath ,"mobile_number must be 10 digits");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    await cleanupAndThrow(newImagePath ,"Invalid email format");
  }

  if (aadhar_number && !/^\d{12}$/.test(aadhar_number)) {
    await cleanupAndThrow(newImagePath ,"aadhar_number must be 12 digits");
  }

  if (pan_card_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan_card_number)) {
    await cleanupAndThrow(newImagePath ,"Invalid PAN format");
  }

  if (gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst_number)) {
    await cleanupAndThrow(newImagePath ,"Invalid GST format");
  }

  if (account_number && !/^\d{9,18}$/.test(account_number)) {
    await cleanupAndThrow(newImagePath ,"Invalid account number");
  }

  if (ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code)) {
    await cleanupAndThrow(newImagePath ,"Invalid IFSC code");
  }

  if (pincode && !/^\d{6}$/.test(pincode)) {
    await cleanupAndThrow(newImagePath ,"Invalid pincode");
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await sql.query(
      `SELECT id FROM vendors WHERE email = $1 AND id != $2`,
      [normalizedEmail, id]
    );

    if (rows.length) {
      await cleanupAndThrow(newImagePath ,"Email already exists");
    }
  }

  try {
 
    const { rows: existing } = await sql.query(
      `SELECT * FROM vendors WHERE id = $1`,
      [id]
    );

    if (!existing.length) {
      await cleanupAndThrow(newImagePath ,"Vendor not found", 404);
    }

    const vendor = existing[0];

    // =========================
    // ✅ UPDATE QUERY
    // =========================

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
        owner_contact_name ?? null,
        mobile_number ?? null,
        email ? email.trim().toLowerCase() : null,
        aadhar_number ?? null,
        pan_card_number ?? null,
        laundry_shop_name ?? null,
        shop_address ?? null,
        gst_number ?? null,
        account_holder_name ?? null,
        bank_name ?? null,
        account_number ?? null,
        ifsc_code ?? null,
        newImagePath,
        pincode ?? null,
        id,
      ]
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


