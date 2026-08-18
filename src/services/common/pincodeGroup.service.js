import sql from "../../config/db.js";
import { seedZonePricesForPincodeGroup } from "./serviceZonePrice.service.js";

const VALID_STATUSES = ["ACTIVE", "INACTIVE"];

const validateStatus = (status) => {
  if (status === undefined || status === null) return "ACTIVE";
  const normalized = String(status).toUpperCase();
  if (!VALID_STATUSES.includes(normalized)) {
    throw { status: 400, message: `status must be one of: ${VALID_STATUSES.join(", ")}` };
  }
  return normalized;
};

const validateCityId = async (cityId, { required = true } = {}) => {
  if (cityId === undefined || cityId === null || cityId === "") {
    if (required) {
      throw { status: 400, message: "city_id is required" };
    }
    return null;
  }

  const id = Number(cityId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "city_id must be a valid positive integer" };
  }

  const { rows } = await sql.query(`SELECT id FROM cities WHERE id = $1`, [id]);
  if (rows.length === 0) {
    throw { status: 400, message: "city_id does not exist" };
  }

  return id;
};

export const createPincodeGroup = async (body) => {
  const { group_code, name, city_id, status } = body;

  if (!group_code?.trim() || !name?.trim()) {
    throw { status: 400, message: "group_code and name are required" };
  }

  const validatedCityId = await validateCityId(city_id, { required: true });

  const client = await sql.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO pincode_groups (group_code, name, city_id, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [group_code.trim(), name.trim(), validatedCityId, validateStatus(status)],
    );
    await seedZonePricesForPincodeGroup(client, rows[0].id);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getPincodeGroups = async (filters = {}) => {
  const conditions = [];
  const values = [];

  if (filters.status) {
    values.push(String(filters.status).toUpperCase());
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await sql.query(
    `SELECT * FROM pincode_groups ${where} ORDER BY id DESC`,
    values,
  );

  return rows;
};

export const getPincodeGroupById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM pincode_groups WHERE id = $1`,
    [id],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Pincode group not found" };
  }

  return rows[0];
};

export const updatePincodeGroup = async (id, body) => {
  const existing = await getPincodeGroupById(id);
  const { group_code, name, city_id, status } = body;

  const validatedCityId =
    city_id !== undefined
      ? await validateCityId(city_id, { required: true })
      : existing.city_id;

  const { rows } = await sql.query(
    `UPDATE pincode_groups
     SET group_code = $1,
         name = $2,
         city_id = $3,
         status = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      group_code?.trim() || existing.group_code,
      name?.trim() || existing.name,
      validatedCityId,
      status !== undefined ? validateStatus(status) : existing.status,
      id,
    ],
  );

  return rows[0];
};

export const deletePincodeGroup = async (id) => {
  await getPincodeGroupById(id);

  try {
    await sql.query(`DELETE FROM pincode_groups WHERE id = $1`, [id]);
  } catch (err) {
    if (err.code === "23503") {
      throw {
        status: 400,
        message: "Cannot delete pincode group while pincodes are assigned to it",
      };
    }
    throw err;
  }
};
