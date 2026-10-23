import sql from "../../config/db.js";

const parseBoolean = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes"].includes(String(value).trim().toLowerCase());
};

const parseClothes = (value, field) => {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isInteger(n) || n <= 0) {
    throw { status: 400, message: `${field} must be a positive integer` };
  }
  return n;
};

const parseKg = (value, field) => {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(n) || n <= 0) {
    throw { status: 400, message: `${field} must be a positive number` };
  }
  return Math.round(n * 100) / 100;
};

const getItemById = async (id) => {
  const { rows } = await sql.query(
    `SELECT * FROM clothes_weight_tiers WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw { status: 404, message: "Clothes weight tier not found" };
  return rows[0];
};

const validateTier = async (tier, excludeId = null) => {
  if (tier.max_clothes < tier.min_clothes) {
    throw { status: 400, message: "max_clothes must be greater than or equal to min_clothes" };
  }
  if (tier.max_kg < tier.min_kg) {
    throw { status: 400, message: "max_kg must be greater than or equal to min_kg" };
  }

  if (!tier.status) return;

  const { rows } = await sql.query(
    `
    SELECT id, min_clothes, max_clothes
    FROM clothes_weight_tiers
    WHERE status = true
      AND ($3::int IS NULL OR id <> $3)
      AND min_clothes <= $2
      AND max_clothes >= $1
    LIMIT 1
    `,
    [tier.min_clothes, tier.max_clothes, excludeId],
  );

  if (rows[0]) {
    throw {
      status: 409,
      message: `Clothes range overlaps with an active tier (${rows[0].min_clothes}-${rows[0].max_clothes})`,
    };
  }
};

export const listClothesWeightTiers = async () => {
  const { rows } = await sql.query(
    `SELECT * FROM clothes_weight_tiers ORDER BY min_clothes ASC, id ASC`,
  );
  return rows;
};

export const getClothesWeightTierById = async (id) => getItemById(id);

export const listActiveClothesWeightTiers = async (db = sql) => {
  const { rows } = await db.query(
    `SELECT id, min_clothes, max_clothes, min_kg, max_kg
     FROM clothes_weight_tiers
     WHERE status = true
     ORDER BY min_clothes ASC, id ASC`,
  );
  return rows;
};

export const createClothesWeightTier = async (body) => {
  const tier = {
    min_clothes: parseClothes(body.min_clothes, "min_clothes"),
    max_clothes: parseClothes(body.max_clothes, "max_clothes"),
    min_kg: parseKg(body.min_kg, "min_kg"),
    max_kg: parseKg(body.max_kg, "max_kg"),
    status: parseBoolean(body.status, true),
  };

  await validateTier(tier);

  const { rows } = await sql.query(
    `
    INSERT INTO clothes_weight_tiers (min_clothes, max_clothes, min_kg, max_kg, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [tier.min_clothes, tier.max_clothes, tier.min_kg, tier.max_kg, tier.status],
  );

  return rows[0];
};

export const updateClothesWeightTier = async (id, body) => {
  const existing = await getItemById(id);

  const tier = {
    min_clothes:
      body.min_clothes !== undefined
        ? parseClothes(body.min_clothes, "min_clothes")
        : Number(existing.min_clothes),
    max_clothes:
      body.max_clothes !== undefined
        ? parseClothes(body.max_clothes, "max_clothes")
        : Number(existing.max_clothes),
    min_kg:
      body.min_kg !== undefined ? parseKg(body.min_kg, "min_kg") : Number(existing.min_kg),
    max_kg:
      body.max_kg !== undefined ? parseKg(body.max_kg, "max_kg") : Number(existing.max_kg),
    status:
      body.status !== undefined
        ? parseBoolean(body.status, existing.status)
        : existing.status,
  };

  await validateTier(tier, Number(id));

  const { rows } = await sql.query(
    `
    UPDATE clothes_weight_tiers
    SET min_clothes = $1,
        max_clothes = $2,
        min_kg = $3,
        max_kg = $4,
        status = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
    `,
    [tier.min_clothes, tier.max_clothes, tier.min_kg, tier.max_kg, tier.status, id],
  );

  return rows[0];
};

export const deleteClothesWeightTier = async (id) => {
  await getItemById(id);
  await sql.query(`DELETE FROM clothes_weight_tiers WHERE id = $1`, [id]);
};
