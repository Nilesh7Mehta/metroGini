import sql from "../../config/db.js";

export const getCommonConfig = async () => {
  const { rows } = await sql.query(
    `SELECT id, support_email, support_phone_no, advance_amount, created_at, updated_at
     FROM app_config
     ORDER BY id ASC
     LIMIT 1`
  );

  return rows[0] || null;
};

export const updateConfigById = async (id, payload) => {
  const configId = Number(id);
  if (!Number.isInteger(configId) || configId <= 0) {
    throw { status: 400, message: "Invalid config id" };
  }

  const fields = [];
  const values = [];
  let index = 1;

  if (payload.support_email !== undefined) {
    fields.push(`support_email = $${index++}`);
    values.push(payload.support_email);
  }

  if (payload.support_phone_no !== undefined) {
    fields.push(`support_phone_no = $${index++}`);
    values.push(payload.support_phone_no);
  }

  if (payload.advance_amount !== undefined) {
    const parsedAdvanceAmount = Number(payload.advance_amount);
    if (Number.isNaN(parsedAdvanceAmount)) {
      throw { status: 400, message: "advance_amount must be a valid number" };
    }
    fields.push(`advance_amount = $${index++}`);
    values.push(parsedAdvanceAmount);
  }

  if (fields.length === 0) {
    throw {
      status: 400,
      message:
        "Provide at least one field: support_email, support_phone_no, advance_amount",
    };
  }

  values.push(configId);

  const { rows } = await sql.query(
    `UPDATE app_config
     SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${index}
     RETURNING id, support_email, support_phone_no, advance_amount, created_at, updated_at`,
    values
  );

  if (!rows.length) {
    throw { status: 404, message: "Config not found" };
  }

  return rows[0];
};
