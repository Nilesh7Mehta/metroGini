import sql from "../../config/db.js";

const PINCODE_REGEX = /^\d{6}$/;

const validatePincode = (value) => {
  const pincode = String(value || "").trim();
  if (!PINCODE_REGEX.test(pincode)) {
    throw { status: 400, message: "pincode must be a valid 6-digit pincode" };
  }
  return pincode;
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
  const { pincode, pincode_group_id, serviceable } = body;

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
