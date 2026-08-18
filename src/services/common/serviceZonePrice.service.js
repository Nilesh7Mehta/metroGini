import sql from "../../config/db.js";

const parsePrice = (value, fieldName = "base_price_per_kg") => {
  if (value === undefined || value === null || value === "") {
    throw { status: 400, message: `${fieldName} is required` };
  }
  const price = Number(value);
  if (Number.isNaN(price) || price < 0) {
    throw { status: 400, message: `${fieldName} must be a non-negative number` };
  }
  return parseFloat(price.toFixed(2));
};

const parseOptionalGroupId = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "pincode_group_id must be a positive integer" };
  }
  return id;
};

const parseOptionalPincode = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return String(value).trim();
};

/**
 * Resolve ₹/kg for a service in a zone.
 * Zone is taken from pincode_group_id, else pincode, else the address pincode.
 * Falls back to services.base_price_per_kg when no zone row exists.
 */
export const resolveBasePricePerKg = async (
  db,
  { serviceId, addressId = null, pincode = null, pincodeGroupId = null },
) => {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "service_id is required to resolve price" };
  }

  const groupId = pincodeGroupId != null ? Number(pincodeGroupId) : null;
  const pincodeValue = parseOptionalPincode(pincode);

  const { rows } = await db.query(
    `SELECT
       COALESCE(szp.base_price_per_kg, s.base_price_per_kg) AS base_price_per_kg
     FROM services s
     LEFT JOIN user_address_details ua ON ua.id = $2
     LEFT JOIN pincodes p
       ON p.pincode = COALESCE($3::varchar, ua.pincode::varchar)
     LEFT JOIN service_zone_prices szp
       ON szp.service_id = s.id
      AND szp.pincode_group_id = COALESCE($4::bigint, p.pincode_group_id)
     WHERE s.id = $1`,
    [id, addressId, pincodeValue, Number.isInteger(groupId) && groupId > 0 ? groupId : null],
  );

  if (rows.length === 0) {
    throw { status: 404, message: "Service not found" };
  }

  return parseFloat(Number(rows[0].base_price_per_kg).toFixed(2));
};

export const getServicesForCatalog = async ({ pincode, pincode_group_id } = {}) => {
  const pincodeValue = parseOptionalPincode(pincode);
  const groupId = parseOptionalGroupId(pincode_group_id);

  const { rows } = await sql.query(
    `SELECT
       s.id,
       s.name,
       s.image,
       s.is_active,
       s.created_at,
       s.updated_at,
       s.base_price_per_kg AS default_base_price_per_kg,
       COALESCE(szp.base_price_per_kg, s.base_price_per_kg) AS base_price_per_kg,
       pg.id AS zone_id,
       pg.group_code AS zone_code,
       pg.name AS zone_name
     FROM services s
     LEFT JOIN pincodes p
       ON $1::varchar IS NOT NULL AND p.pincode = $1
     LEFT JOIN pincode_groups pg
       ON pg.id = COALESCE($2::bigint, p.pincode_group_id)
     LEFT JOIN service_zone_prices szp
       ON szp.service_id = s.id
      AND szp.pincode_group_id = COALESCE($2::bigint, p.pincode_group_id)
     ORDER BY s.id DESC`,
    [pincodeValue, groupId],
  );

  return rows;
};

export const seedZonePricesForService = async (db, serviceId, basePricePerKg) => {
  await db.query(
    `INSERT INTO service_zone_prices (service_id, pincode_group_id, base_price_per_kg)
     SELECT $1, pg.id, $2
     FROM pincode_groups pg
     ON CONFLICT (service_id, pincode_group_id) DO NOTHING`,
    [serviceId, basePricePerKg],
  );
};

export const seedZonePricesForPincodeGroup = async (db, pincodeGroupId) => {
  await db.query(
    `INSERT INTO service_zone_prices (service_id, pincode_group_id, base_price_per_kg)
     SELECT s.id, $1, s.base_price_per_kg
     FROM services s
     ON CONFLICT (service_id, pincode_group_id) DO NOTHING`,
    [pincodeGroupId],
  );
};

export const getServiceZonePrices = async (serviceId) => {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid service id" };
  }

  const serviceResult = await sql.query(
    `SELECT id, name, base_price_per_kg FROM services WHERE id = $1`,
    [id],
  );
  if (serviceResult.rows.length === 0) {
    throw { status: 404, message: "Service not found" };
  }

  const service = serviceResult.rows[0];
  const { rows } = await sql.query(
    `SELECT
       pg.id AS pincode_group_id,
       pg.group_code,
       pg.name AS zone_name,
       pg.city_id,
       c.city_name,
       pg.status AS zone_status,
       szp.base_price_per_kg AS zone_price,
       s.base_price_per_kg AS default_price,
       COALESCE(szp.base_price_per_kg, s.base_price_per_kg) AS base_price_per_kg
     FROM pincode_groups pg
     CROSS JOIN services s
     LEFT JOIN cities c ON c.id = pg.city_id
     LEFT JOIN service_zone_prices szp
       ON szp.service_id = s.id AND szp.pincode_group_id = pg.id
     WHERE s.id = $1
     ORDER BY pg.name ASC, pg.id ASC`,
    [id],
  );

  return {
    service_id: Number(service.id),
    service_name: service.name,
    default_base_price_per_kg: parseFloat(Number(service.base_price_per_kg).toFixed(2)),
    zones: rows,
  };
};

export const upsertServiceZonePrices = async (serviceId, pricesInput) => {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: "Invalid service id" };
  }

  const { rows: serviceRows } = await sql.query(
    `SELECT id FROM services WHERE id = $1`,
    [id],
  );
  if (serviceRows.length === 0) {
    throw { status: 404, message: "Service not found" };
  }

  const raw =
    pricesInput?.prices ?? pricesInput?.zone_prices ?? pricesInput;
  const prices = Array.isArray(raw) ? raw : [raw];
  if (prices.length === 0 || prices[0] == null) {
    throw { status: 400, message: "prices must be a non-empty array" };
  }

  const client = await sql.connect();
  try {
    await client.query("BEGIN");

    for (const item of prices) {
      const groupId = parseOptionalGroupId(item?.pincode_group_id);
      if (groupId == null) {
        throw { status: 400, message: "pincode_group_id is required for each price" };
      }

      const groupCheck = await client.query(
        `SELECT id FROM pincode_groups WHERE id = $1`,
        [groupId],
      );
      if (groupCheck.rows.length === 0) {
        throw { status: 400, message: `pincode_group_id ${groupId} does not exist` };
      }

      const price = parsePrice(item.base_price_per_kg);
      await client.query(
        `INSERT INTO service_zone_prices (service_id, pincode_group_id, base_price_per_kg)
         VALUES ($1, $2, $3)
         ON CONFLICT (service_id, pincode_group_id)
         DO UPDATE SET
           base_price_per_kg = EXCLUDED.base_price_per_kg,
           updated_at = CURRENT_TIMESTAMP`,
        [id, groupId, price],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getServiceZonePrices(id);
};
