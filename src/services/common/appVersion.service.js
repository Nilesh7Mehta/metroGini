import sql from "../../config/db.js";

export const ALLOWED_APP_FOR = ["user", "rider"];
export const ALLOWED_TYPES = ["android", "ios"];
export const UPDATABLE_FIELDS = ["version", "app_url", "status"];

export const getAppVersions = async (appFor) => {
  if (appFor && !ALLOWED_APP_FOR.includes(appFor)) {
    throw {
      status: 400,
      message: "Invalid app_for. Allowed values: user, rider",
    };
  }

  const { rows } = appFor
    ? await sql.query(
        `SELECT id, app_for, version, type, app_url, status
         FROM app_versions
         WHERE app_for = $1
         ORDER BY app_for, type`,
        [appFor],
      )
    : await sql.query(
        `SELECT id, app_for, version, type, app_url, status
         FROM app_versions
         ORDER BY app_for, type`,
      );

  const grouped = {};

  for (const row of rows) {
    if (!grouped[row.app_for]) {
      grouped[row.app_for] = {
        app_for: row.app_for,
        version_data: {},
      };
    }

    grouped[row.app_for].version_data[row.type] = {
      version: row.version,
      app_url: row.app_url,
      status: row.status,
    };
  }

  return Object.values(grouped);
};

export const updateAppVersionInfo = async (appFor, type, fields) => {
  const updates = Object.entries(fields).filter(
    ([key, value]) => UPDATABLE_FIELDS.includes(key) && value !== undefined,
  );

  if (!updates.length) {
    throw {
      status: 400,
      message: "No updatable fields provided. Allowed: version, app_url, status",
    };
  }

  const setClauses = updates.map((_, index) => `${updates[index][0]} = $${index + 1}`);
  const values = updates.map(([, value]) => value);

  const { rowCount } = await sql.query(
    `UPDATE app_versions
     SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE app_for = $${values.length + 1} AND type = $${values.length + 2}`,
    [...values, appFor, type],
  );

  if (!rowCount) {
    throw { status: 404, message: "App version record not found" };
  }

  const { rows } = await sql.query(
    `SELECT id, app_for, version, type, app_url, status
     FROM app_versions
     WHERE app_for = $1 AND type = $2`,
    [appFor, type],
  );

  return rows[0];
};
