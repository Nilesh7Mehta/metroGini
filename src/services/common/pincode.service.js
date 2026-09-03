import sql from "../../config/db.js";
import { SLOT_AVAILABILITY_DAYS } from "../../constants/slotAvailability.js";

const PINCODE_REGEX = /^\d{6}$/;

export const PINCODE_NOT_SERVICEABLE_MESSAGE =
  "Service is coming soon in this pincode. Please try another address.";

const validatePincode = (value) => {
  const pincode = String(value || "").trim();
  if (!PINCODE_REGEX.test(pincode)) {
    throw { status: 400, message: "pincode must be a valid 6-digit pincode" };
  }
  return pincode;
};

const notBookable = (pincode, extras = {}) => ({
  serviceable: false,
  pincode: pincode || null,
  pincode_group_id: null,
  group_code: null,
  group_name: null,
  has_vendor_slots: false,
  has_rider_slots: false,
  message: PINCODE_NOT_SERVICEABLE_MESSAGE,
  ...extras,
});

/**
 * Soft evaluation: pin in DB + serviceable + ACTIVE group + overlapping
 * vendor+rider schedule in the next SLOT_AVAILABILITY_DAYS window.
 * Does not throw for coverage failures (invalid format still throws).
 */
export const evaluatePincodeBookable = async (pincode) => {
  const validatedPincode = validatePincode(pincode);

  const { rows } = await sql.query(
    `SELECT p.pincode,
            p.pincode_group_id,
            p.serviceable,
            pg.group_code,
            pg.name AS group_name,
            pg.status AS group_status
     FROM pincodes p
     LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     WHERE p.pincode = $1`,
    [validatedPincode],
  );

  const row = rows[0];
  if (!row) {
    return notBookable(validatedPincode, { code: "pincode_not_found" });
  }

  if (row.serviceable !== true) {
    return notBookable(validatedPincode, {
      code: "pincode_not_serviceable",
      pincode_group_id: row.pincode_group_id
        ? Number(row.pincode_group_id)
        : null,
      group_code: row.group_code || null,
      group_name: row.group_name || null,
    });
  }

  if (
    !row.pincode_group_id ||
    String(row.group_status || "").toUpperCase() !== "ACTIVE"
  ) {
    return notBookable(validatedPincode, {
      code: "group_inactive",
      pincode_group_id: row.pincode_group_id
        ? Number(row.pincode_group_id)
        : null,
      group_code: row.group_code || null,
      group_name: row.group_name || null,
    });
  }

  const pincodeGroupId = Number(row.pincode_group_id);
  const lookAheadDays = SLOT_AVAILABILITY_DAYS;

  const scheduleRes = await sql.query(
    `
    WITH upcoming AS (
      SELECT
        d::date AS slot_date,
        EXTRACT(ISODOW FROM d)::int AS day_of_week
      FROM generate_series(
        (CURRENT_DATE + INTERVAL '1 day')::date,
        (CURRENT_DATE + ($2::int * INTERVAL '1 day'))::date,
        INTERVAL '1 day'
      ) AS d
    ),
    vendor_days AS (
      SELECT DISTINCT u.day_of_week, lgss.shift_id
      FROM upcoming u
      INNER JOIN laundry_group_shift_schedule lgss
        ON lgss.pincode_group_id = $1
       AND lgss.day_of_week = u.day_of_week
    ),
    rider_days AS (
      SELECT DISTINCT u.day_of_week, rgss.shift_id
      FROM upcoming u
      INNER JOIN rider_group_shift_schedule rgss
        ON rgss.pincode_group_id = $1
       AND rgss.day_of_week = u.day_of_week
    )
    SELECT
      EXISTS (SELECT 1 FROM vendor_days) AS has_vendor_slots,
      EXISTS (SELECT 1 FROM rider_days) AS has_rider_slots,
      EXISTS (
        SELECT 1
        FROM vendor_days v
        INNER JOIN rider_days r
          ON r.day_of_week = v.day_of_week
         AND r.shift_id = v.shift_id
      ) AS has_overlapping_slots
    `,
    [pincodeGroupId, lookAheadDays],
  );

  const flags = scheduleRes.rows[0] || {};
  const hasVendor = Boolean(flags.has_vendor_slots);
  const hasRider = Boolean(flags.has_rider_slots);
  const hasOverlap = Boolean(flags.has_overlapping_slots);

  if (!hasOverlap) {
    return notBookable(validatedPincode, {
      code: "no_vendor_rider_slots",
      pincode_group_id: pincodeGroupId,
      group_code: row.group_code,
      group_name: row.group_name,
      has_vendor_slots: hasVendor,
      has_rider_slots: hasRider,
    });
  }

  return {
    serviceable: true,
    pincode: row.pincode,
    pincode_group_id: pincodeGroupId,
    group_code: row.group_code,
    group_name: row.group_name,
    has_vendor_slots: true,
    has_rider_slots: true,
    message: null,
    code: null,
  };
};

/**
 * Ensures the pincode exists in our coverage table, is marked serviceable,
 * and belongs to an ACTIVE pincode group (zone).
 * Does NOT require vendor/rider schedules (use assertPincodeBookable for that).
 */
export const assertPincodeServiceable = async (pincode) => {
  const validatedPincode = validatePincode(pincode);

  const { rows } = await sql.query(
    `SELECT p.pincode,
            p.pincode_group_id,
            p.serviceable,
            pg.group_code,
            pg.name AS group_name,
            pg.status AS group_status
     FROM pincodes p
     LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     WHERE p.pincode = $1`,
    [validatedPincode],
  );

  const row = rows[0];
  const isServiceable =
    row &&
    row.serviceable === true &&
    row.pincode_group_id &&
    String(row.group_status || "").toUpperCase() === "ACTIVE";

  if (!isServiceable) {
    throw {
      status: 400,
      code: "pincode_not_serviceable",
      message: PINCODE_NOT_SERVICEABLE_MESSAGE,
    };
  }

  return {
    pincode: row.pincode,
    pincode_group_id: Number(row.pincode_group_id),
    group_code: row.group_code,
    group_name: row.group_name,
    serviceable: true,
  };
};

export const checkPincodeServiceable = async (pincode) => {
  const data = await assertPincodeServiceable(pincode);
  return data;
};

/**
 * Strict: zone + vendor + rider must be bookable for upcoming slots.
 * Used by add/update/default address and WhatsApp pincode-check consumers
 * that prefer throw semantics.
 */
export const assertPincodeBookable = async (pincode) => {
  const result = await evaluatePincodeBookable(pincode);
  if (!result.serviceable) {
    throw {
      status: 400,
      code: result.code || "pincode_not_serviceable",
      message: PINCODE_NOT_SERVICEABLE_MESSAGE,
    };
  }
  return {
    pincode: result.pincode,
    pincode_group_id: result.pincode_group_id,
    group_code: result.group_code,
    group_name: result.group_name,
    serviceable: true,
  };
};

export const checkPincodeBookable = async (pincode) => {
  return evaluatePincodeBookable(pincode);
};

const validateGroupId = async (pincodeGroupId) => {
  const id = Number(pincodeGroupId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "pincode_group_id must be a valid positive integer" };
  }

  const { rows } = await sql.query(
    `SELECT id FROM pincode_groups WHERE id = $1`,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 400, message: "pincode_group_id does not exist" };
  }

  return id;
};

export const createPincode = async (body) => {
  const createSinglePincode = async (item) => {
    const { pincode, pincode_group_id, serviceable } = item || {};

    if (!pincode || pincode_group_id === undefined || pincode_group_id === null) {
      throw { status: 400, message: "pincode and pincode_group_id are required" };
    }

    const validatedPincode = validatePincode(pincode);
    const validatedGroupId = await validateGroupId(pincode_group_id);

    const { rows } = await sql.query(
      `INSERT INTO pincodes (pincode, pincode_group_id, serviceable)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [validatedPincode, validatedGroupId, serviceable ?? true],
    );

    return rows[0];
  };

  if (Array.isArray(body?.pincodes)) {
    if (body.pincodes.length === 0) {
      throw { status: 400, message: "pincodes array must not be empty" };
    }

    const created = [];
    for (const item of body.pincodes) {
      created.push(await createSinglePincode(item));
    }
    return created;
  }

  return createSinglePincode(body);
};

export const getPincodes = async (filters = {}) => {
  const conditions = [];
  const values = [];

  if (filters.pincode_group_id !== undefined) {
    values.push(Number(filters.pincode_group_id));
    conditions.push(`p.pincode_group_id = $${values.length}`);
  }

  if (filters.serviceable !== undefined) {
    values.push(filters.serviceable === "true" || filters.serviceable === true);
    conditions.push(`p.serviceable = $${values.length}`);
  }

  if (filters.pincode) {
    values.push(String(filters.pincode).trim());
    conditions.push(`p.pincode = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await sql.query(
    `SELECT p.*,
            pg.group_code,
            pg.name AS group_name,
            pg.status AS group_status
     FROM pincodes p
     JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     ${where}
     ORDER BY p.id DESC`,
    values,
  );

  return rows;
};

export const getPincodeById = async (id) => {
  const { rows } = await sql.query(
    `SELECT p.*,
            pg.group_code,
            pg.name AS group_name,
            pg.status AS group_status
     FROM pincodes p
     JOIN pincode_groups pg ON pg.id = p.pincode_group_id
     WHERE p.id = $1`,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Pincode not found" };
  }

  return rows[0];
};

export const updatePincode = async (id, body) => {
  const existing = await getPincodeById(id);
  const { pincode, pincode_group_id, serviceable } = body;

  const validatedPincode =
    pincode !== undefined ? validatePincode(pincode) : existing.pincode;

  const validatedGroupId =
    pincode_group_id !== undefined
      ? await validateGroupId(pincode_group_id)
      : existing.pincode_group_id;

  const { rows } = await sql.query(
    `UPDATE pincodes
     SET pincode = $1,
         pincode_group_id = $2,
         serviceable = $3
     WHERE id = $4
     RETURNING *`,
    [
      validatedPincode,
      validatedGroupId,
      serviceable !== undefined ? Boolean(serviceable) : existing.serviceable,
      id,
    ],
  );

  return rows[0];
};

export const deletePincode = async (id) => {
  const { rowCount } = await sql.query(`DELETE FROM pincodes WHERE id = $1`, [id]);

  if (rowCount === 0) {
    throw { status: 404, message: "Pincode not found" };
  }
};
