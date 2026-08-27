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

const getItemById = async (id) => {
  const { rows } = await sql.query(`SELECT * FROM faqs WHERE id = $1`, [id]);
  if (!rows[0]) throw { status: 404, message: "FAQ not found" };
  return rows[0];
};

const nextSequence = async () => {
  const { rows } = await sql.query(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM faqs`,
  );
  return Number(rows[0].next);
};

export const listFaqs = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM faqs ORDER BY sequence ASC, id ASC`,
  );
  return rows;
};

export const getFaqById = async (id) => getItemById(id);

export const listActiveFaqs = async () => {
  const { rows } = await sql.query(
    `SELECT id, question, answer, sequence
     FROM faqs
     WHERE status = true
     ORDER BY sequence ASC, id ASC`,
  );
  return rows;
};

export const createFaq = async (body) => {
  const question = body.question?.trim();
  const answer = body.answer?.trim();

  if (!question) throw { status: 400, message: "question is required" };
  if (!answer) throw { status: 400, message: "answer is required" };

  const sequence = parseSequence(body.sequence, await nextSequence());
  const status = parseBoolean(body.status, true);

  const { rows } = await sql.query(
    `
    INSERT INTO faqs (question, answer, status, sequence)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [question, answer, status, sequence],
  );

  return rows[0];
};

export const updateFaq = async (id, body) => {
  const existing = await getItemById(id);

  const { rows } = await sql.query(
    `
    UPDATE faqs
    SET question = $1,
        answer = $2,
        status = $3,
        sequence = $4,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
    `,
    [
      body.question?.trim() || existing.question,
      body.answer?.trim() || existing.answer,
      body.status !== undefined
        ? parseBoolean(body.status, existing.status)
        : existing.status,
      body.sequence !== undefined
        ? parseSequence(body.sequence, existing.sequence)
        : existing.sequence,
      id,
    ],
  );

  return rows[0];
};

export const deleteFaq = async (id) => {
  await getItemById(id);
  await sql.query(`DELETE FROM faqs WHERE id = $1`, [id]);
};
