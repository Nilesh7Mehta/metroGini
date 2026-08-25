import sql from "../../config/db.js";
import { deleteFile } from "../../utils/file.service.js";

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
};

const getItemById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM how_we_work WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "How we work item not found" };
  return rows[0];
};

export const listHowWeWork = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM how_we_work ORDER BY id ASC`,
  );
  return rows;
};

export const getHowWeWorkById = async (id) => getItemById(id);

export const listActiveHowWeWork = async () => {
  const { rows } = await sql.query(
    `SELECT id, heading, image
     FROM how_we_work
     WHERE status = true
     ORDER BY id ASC`,
  );
  return rows;
};

export const createHowWeWork = async (body, imagePath) => {
  const heading = body.heading?.trim();
  if (!heading) throw { status: 400, message: "heading is required" };
  if (!imagePath) throw { status: 400, message: "image is required" };

  const { rows } = await sql.query(
    `
    INSERT INTO how_we_work (heading, image, status)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [heading, imagePath, parseBoolean(body.status, true)],
  );

  return rows[0];
};

export const updateHowWeWork = async (id, body, imagePath) => {
  const existing = await getItemById(id);

  let resolvedImage = existing.image;
  if (imagePath) {
    if (existing.image) await deleteFile(existing.image);
    resolvedImage = imagePath;
  }

  const { rows } = await sql.query(
    `
    UPDATE how_we_work
    SET heading = $1,
        image = $2,
        status = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
    `,
    [
      body.heading?.trim() || existing.heading,
      resolvedImage,
      body.status !== undefined
        ? parseBoolean(body.status, existing.status)
        : existing.status,
      id,
    ],
  );

  return rows[0];
};

export const deleteHowWeWork = async (id) => {
  const existing = await getItemById(id);
  if (existing.image) await deleteFile(existing.image);
  await sql.query(`DELETE FROM how_we_work WHERE id = $1`, [id]);
};
