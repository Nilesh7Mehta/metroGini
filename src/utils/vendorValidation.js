const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^\d{10}$/;
const AADHAR_REGEX = /^\d{12}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GST_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Reference formats for validation error messages */
export const VENDOR_FORMAT_EXAMPLES = {
  aadhaar: "123456789012",
  pan: "AAAAA1234A",
  gst: "22AAAAA0000A1Z5",
};
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PINCODE_REGEX = /^\d{6}$/;

const emptyToNull = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || /^n\/?a$/i.test(trimmed)) return null;
  return trimmed;
};

export const normalizeVendorFields = (data = {}) => ({
  owner_contact_name: data.owner_contact_name,
  mobile_number: data.mobile_number,
  email: typeof data.email === "string" ? data.email.trim() : data.email,
  aadhar_number: emptyToNull(data.aadhar_number),
  pan_card_number: data.pan_card_number?.toUpperCase?.(),
  gst_number: emptyToNull(data.gst_number)?.toUpperCase?.() ?? null,
  laundry_shop_name: data.laundry_shop_name,
  shop_address: data.shop_address,
  pincode: data.pincode,
  account_holder_name: data.account_holder_name,
  bank_name: data.bank_name,
  account_number: data.account_number,
  ifsc_code: data.ifsc_code?.toUpperCase?.(),
});

/**
 * @param {object} data - vendor fields (DB keys)
 * @param {{ partial?: boolean }} options - partial: only validate keys present in `data`
 */
export const validateVendorFields = (data = {}, { partial = false } = {}) => {
  const fields = normalizeVendorFields(data);
  const isPresent = (key) => data[key] !== undefined;

  const fail = (message) => {
    throw { status: 400, message };
  };

  const requireField = (key, label) => {
    const value = fields[key];
    if (!value || (typeof value === "string" && !value.trim())) {
      fail(`${label} is required`);
    }
  };

  const validatePresent = (key, isValid, message) => {
    if (partial && !isPresent(key)) return;
    if (!partial || isPresent(key)) {
      if (!isValid(fields[key])) fail(message);
    }
  };

  if (!partial) {
    requireField("owner_contact_name", "owner_contact_name");
    requireField("mobile_number", "mobile_number");
    requireField("email", "email");
    requireField("laundry_shop_name", "laundry_shop_name");
    requireField("account_holder_name", "account_holder_name");
    requireField("bank_name", "bank_name");
    requireField("account_number", "account_number");
    requireField("ifsc_code", "ifsc_code");
  }

  validatePresent(
    "owner_contact_name",
    (v) => typeof v === "string" && v.trim().length > 0,
    "owner_name must not be empty",
  );

  validatePresent(
    "mobile_number",
    (v) => v != null && MOBILE_REGEX.test(String(v)),
    "mobile must be a 10-digit number",
  );

  validatePresent(
    "email",
    (v) => typeof v === "string" && EMAIL_REGEX.test(v),
    "email must be a valid email address",
  );

  validatePresent(
    "aadhar_number",
    (v) => !v || AADHAR_REGEX.test(String(v)),
    `aadhar_number must be exactly 12 digits (e.g. ${VENDOR_FORMAT_EXAMPLES.aadhaar})`,
  );

  validatePresent(
    "pan_card_number",
    (v) => !v || PAN_REGEX.test(String(v)),
    `pan_number must be in valid format (e.g. ${VENDOR_FORMAT_EXAMPLES.pan})`,
  );

  validatePresent(
    "gst_number",
    (v) => !v || GST_REGEX.test(String(v)),
    `gst_number must be a valid 15-character GST number (e.g. ${VENDOR_FORMAT_EXAMPLES.gst})`,
  );

  validatePresent(
    "laundry_shop_name",
    (v) => typeof v === "string" && v.trim().length > 0,
    "laundry_name must not be empty",
  );

  validatePresent(
    "pincode",
    (v) => !v || PINCODE_REGEX.test(String(v)),
    "pincode must be a valid 6-digit pincode",
  );

  validatePresent(
    "account_number",
    (v) => !v || ACCOUNT_NUMBER_REGEX.test(String(v)),
    "account_number must be a valid numeric bank account number (9–18 digits)",
  );

  validatePresent(
    "ifsc_code",
    (v) => !v || IFSC_REGEX.test(String(v)),
    "ifsc_code must be a valid IFSC code (e.g. SBIN0001234) in uppercase",
  );

  validatePresent(
    "account_holder_name",
    (v) => !v || (typeof v === "string" && v.trim().length > 0),
    "account_holder_name must not be empty",
  );

  validatePresent(
    "bank_name",
    (v) => !v || (typeof v === "string" && v.trim().length > 0),
    "bank_name must not be empty",
  );

  return fields;
};
