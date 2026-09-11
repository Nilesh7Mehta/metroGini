import sql from "../../config/db.js";

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
};

const parseSequence = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw { status: 400, message: "sequence must be a positive integer" };
  }
  return n;
};

const parseId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid section id" };
  }
  return id;
};

const nextSequence = async () => {
  const { rows } = await sql.query(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM privacy_policy_sections`,
  );
  return Number(rows[0].next);
};

const getSectionById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM privacy_policy_sections WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "Privacy policy section not found" };
  return rows[0];
};

export const getAdminPrivacyPolicy = async () => {
  const [pageRes, sectionsRes] = await Promise.all([
    sql.query(`SELECT * FROM privacy_policy ORDER BY id ASC LIMIT 1`),
    sql.query(
      `SELECT * FROM privacy_policy_sections ORDER BY sequence ASC, id ASC`,
    ),
  ]);

  const page = pageRes.rows[0] || null;

  return {
    page: page
      ? {
          id: page.id,
          title: page.title,
          subtitle: page.subtitle,
          last_modified: page.last_modified,
          created_at: page.created_at,
          updated_at: page.updated_at,
        }
      : null,
    sections: sectionsRes.rows,
  };
};

export const updateAdminPrivacyPage = async (body) => {
  const title = body.title?.trim();
  const subtitle = body.subtitle?.trim();
  const last_modified = body.last_modified?.trim();

  const existing = await sql.query(
    `SELECT * FROM privacy_policy ORDER BY id ASC LIMIT 1`,
  );

  if (!existing.rows[0]) {
    if (!title) throw { status: 400, message: "title is required" };
    const { rows } = await sql.query(
      `INSERT INTO privacy_policy (title, subtitle, last_modified)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [title, subtitle || null, last_modified || null],
    );
    return rows[0];
  }

  const current = existing.rows[0];
  const { rows } = await sql.query(
    `UPDATE privacy_policy
     SET title = $1,
         subtitle = $2,
         last_modified = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [
      title || current.title,
      subtitle !== undefined ? subtitle || null : current.subtitle,
      last_modified !== undefined
        ? last_modified || null
        : current.last_modified,
      current.id,
    ],
  );

  return rows[0];
};

export const createPrivacySection = async (body) => {
  const title = body.title?.trim();
  const bodyText = body.body?.trim();
  if (!title) throw { status: 400, message: "title is required" };
  if (!bodyText) throw { status: 400, message: "body is required" };

  const sequence = parseSequence(body.sequence, await nextSequence());
  const status = parseBoolean(body.status, true);

  const { rows } = await sql.query(
    `INSERT INTO privacy_policy_sections (title, body, sequence, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, bodyText, sequence, status],
  );
  return rows[0];
};

export const updatePrivacySection = async (rawId, body) => {
  const id = parseId(rawId);
  const existing = await getSectionById(id);

  const { rows } = await sql.query(
    `UPDATE privacy_policy_sections
     SET title = $1,
         body = $2,
         sequence = $3,
         status = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      body.title?.trim() || existing.title,
      body.body?.trim() || existing.body,
      body.sequence !== undefined
        ? parseSequence(body.sequence, existing.sequence)
        : existing.sequence,
      body.status !== undefined
        ? parseBoolean(body.status, existing.status)
        : existing.status,
      id,
    ],
  );
  return rows[0];
};

export const deletePrivacySection = async (rawId) => {
  const id = parseId(rawId);
  await getSectionById(id);
  await sql.query(`DELETE FROM privacy_policy_sections WHERE id = $1`, [id]);
};
