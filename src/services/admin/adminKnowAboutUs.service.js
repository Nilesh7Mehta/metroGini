import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";

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
  const { rows } = await sql.query(
    `SELECT * FROM know_about_us WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "Know about us item not found" };
  return rows[0];
};

const nextSequence = async () => {
  const { rows } = await sql.query(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM know_about_us`,
  );
  return Number(rows[0].next);
};

export const listKnowAboutUs = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM know_about_us ORDER BY sequence ASC, id ASC`,
  );
  return rows;
};

export const getKnowAboutUsById = async (id) => getItemById(id);

export const listActiveKnowAboutUs = async () => {
  const { rows } = await sql.query(
    `SELECT id, title, description, image, sequence
     FROM know_about_us
     WHERE status = true
     ORDER BY sequence ASC, id ASC`,
  );
  return rows;
};

export const createKnowAboutUs = async (body, imagePath) => {
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (!title) throw { status: 400, message: "title is required" };
  if (!description) throw { status: 400, message: "description is required" };
  if (!imagePath) throw { status: 400, message: "image is required" };

  const sequence = parseSequence(body.sequence, await nextSequence());
  const status = parseBoolean(body.status, true);

  const { rows } = await sql.query(
    `
    INSERT INTO know_about_us (title, description, image, status, sequence)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [title, description, imagePath, status, sequence],
  );

  return rows[0];
};

export const updateKnowAboutUs = async (id, body, imagePath) => {
  const existing = await getItemById(id);

  let resolvedImage = existing.image;
  if (imagePath) {
    if (existing.image) await deleteFile(existing.image);
    resolvedImage = imagePath;
  }

  const { rows } = await sql.query(
    `
    UPDATE know_about_us
    SET title = $1,
        description = $2,
        image = $3,
        status = $4,
        sequence = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
    `,
    [
      body.title?.trim() || existing.title,
      body.description?.trim() || existing.description,
      resolvedImage,
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

export const deleteKnowAboutUs = async (id) => {
  const existing = await getItemById(id);
  if (existing.image) await deleteFile(existing.image);
  await sql.query(`DELETE FROM know_about_us WHERE id = $1`, [id]);
};
