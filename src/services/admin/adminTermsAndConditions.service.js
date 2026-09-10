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

const parseId = (raw, label) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: `Invalid ${label} id` };
  }
  return id;
};

const nextSequence = async (table) => {
  const { rows } = await sql.query(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM ${table}`,
  );
  return Number(rows[0].next);
};

const getSectionById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM terms_and_conditions_sections WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "Terms section not found" };
  return rows[0];
};

const getConsentById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM terms_and_conditions_consents WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "Terms consent not found" };
  return rows[0];
};

export const getAdminTermsAndConditions = async () => {
  const [pageRes, sectionsRes, consentsRes] = await Promise.all([
    sql.query(
      `SELECT * FROM terms_and_conditions ORDER BY id ASC LIMIT 1`,
    ),
    sql.query(
      `SELECT * FROM terms_and_conditions_sections ORDER BY sequence ASC, id ASC`,
    ),
    sql.query(
      `SELECT * FROM terms_and_conditions_consents ORDER BY sequence ASC, id ASC`,
    ),
  ]);

  const page = pageRes.rows[0] || null;

  return {
    page: page
      ? {
          id: page.id,
          title: page.title,
          subtitle: page.subtitle,
          notice_title: page.notice_title,
          notice_text: page.notice_text,
          created_at: page.created_at,
          updated_at: page.updated_at,
        }
      : null,
    sections: sectionsRes.rows,
    consents: consentsRes.rows,
  };
};

export const updateAdminTermsPage = async (body) => {
  const title = body.title?.trim();
  const subtitle = body.subtitle?.trim();
  const notice_title = body.notice_title?.trim();
  const notice_text = body.notice_text?.trim();

  const existing = await sql.query(
    `SELECT * FROM terms_and_conditions ORDER BY id ASC LIMIT 1`,
  );

  if (!existing.rows[0]) {
    if (!title) throw { status: 400, message: "title is required" };
    const { rows } = await sql.query(
      `INSERT INTO terms_and_conditions (title, subtitle, notice_title, notice_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, subtitle || null, notice_title || null, notice_text || null],
    );
    return rows[0];
  }

  const current = existing.rows[0];
  const { rows } = await sql.query(
    `UPDATE terms_and_conditions
     SET title = $1,
         subtitle = $2,
         notice_title = $3,
         notice_text = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      title || current.title,
      subtitle !== undefined ? subtitle || null : current.subtitle,
      notice_title !== undefined ? notice_title || null : current.notice_title,
      notice_text !== undefined ? notice_text || null : current.notice_text,
      current.id,
    ],
  );

  return rows[0];
};

export const createTermsSection = async (body) => {
  const title = body.title?.trim();
  const bodyText = body.body?.trim();
  if (!title) throw { status: 400, message: "title is required" };
  if (!bodyText) throw { status: 400, message: "body is required" };

  const sequence = parseSequence(
    body.sequence,
    await nextSequence("terms_and_conditions_sections"),
  );
  const status = parseBoolean(body.status, true);

  const { rows } = await sql.query(
    `INSERT INTO terms_and_conditions_sections (title, body, sequence, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [title, bodyText, sequence, status],
  );
  return rows[0];
};

export const updateTermsSection = async (rawId, body) => {
  const id = parseId(rawId, "section");
  const existing = await getSectionById(id);

  const { rows } = await sql.query(
    `UPDATE terms_and_conditions_sections
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

export const deleteTermsSection = async (rawId) => {
  const id = parseId(rawId, "section");
  await getSectionById(id);
  await sql.query(`DELETE FROM terms_and_conditions_sections WHERE id = $1`, [id]);
};

export const createTermsConsent = async (body) => {
  const bodyText = body.body?.trim();
  if (!bodyText) throw { status: 400, message: "body is required" };

  const sequence = parseSequence(
    body.sequence,
    await nextSequence("terms_and_conditions_consents"),
  );
  const status = parseBoolean(body.status, true);

  const { rows } = await sql.query(
    `INSERT INTO terms_and_conditions_consents (body, sequence, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [bodyText, sequence, status],
  );
  return rows[0];
};

export const updateTermsConsent = async (rawId, body) => {
  const id = parseId(rawId, "consent");
  const existing = await getConsentById(id);

  const { rows } = await sql.query(
    `UPDATE terms_and_conditions_consents
     SET body = $1,
         sequence = $2,
         status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [
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

export const deleteTermsConsent = async (rawId) => {
  const id = parseId(rawId, "consent");
  await getConsentById(id);
  await sql.query(`DELETE FROM terms_and_conditions_consents WHERE id = $1`, [id]);
};
