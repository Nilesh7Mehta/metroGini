import sql from '../config/db.js';

export const parseOptionalPositiveInt = (value, fieldName = 'id') => {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 400, message: `${fieldName} must be a positive integer` };
  }
  return id;
};

export const resolveCityFilter = async (query = {}) => {
  const cityId = parseOptionalPositiveInt(query.city_id, 'city_id');
  if (cityId == null) {
    return { city_id: null, city_name: null };
  }

  const { rows } = await sql.query(
    `SELECT id, city_name FROM cities WHERE id = $1`,
    [cityId],
  );
  if (!rows.length) {
    throw { status: 404, message: 'city_id not found' };
  }

  return {
    city_id: Number(rows[0].id),
    city_name: rows[0].city_name || null,
  };
};

export const resolveZoneFilter = async (query = {}) => {
  const zoneId = parseOptionalPositiveInt(
    query.pincode_group_id ?? query.zone_id,
    'zone_id / pincode_group_id',
  );
  const zoneCodeRaw = query.zone_code;
  const zoneCode =
    zoneCodeRaw != null && String(zoneCodeRaw).trim() !== ''
      ? String(zoneCodeRaw).trim()
      : null;

  if (zoneId == null && zoneCode == null) {
    return {
      pincode_group_id: null,
      zone_id: null,
      zone_code: null,
      zone_name: null,
    };
  }

  let rows;
  if (zoneId != null) {
    ({ rows } = await sql.query(
      `SELECT id, group_code, name, city_id FROM pincode_groups WHERE id = $1`,
      [zoneId],
    ));
    if (!rows.length) {
      throw { status: 404, message: 'pincode_group_id not found' };
    }
  } else {
    ({ rows } = await sql.query(
      `SELECT id, group_code, name, city_id FROM pincode_groups WHERE group_code = $1`,
      [zoneCode],
    ));
    if (!rows.length) {
      throw { status: 404, message: 'zone_code not found' };
    }
  }

  const row = rows[0];
  return {
    pincode_group_id: Number(row.id),
    zone_id: Number(row.id),
    zone_code: row.group_code || null,
    zone_name: row.name || null,
    city_id: row.city_id != null ? Number(row.city_id) : null,
  };
};

/** Resolve city + zone together; if both set, zone must belong to city. */
export const resolveGeoFilters = async (query = {}) => {
  const [cityFilter, zoneFilter] = await Promise.all([
    resolveCityFilter(query),
    resolveZoneFilter(query),
  ]);

  if (
    cityFilter.city_id != null &&
    zoneFilter.pincode_group_id != null &&
    zoneFilter.city_id != null &&
    Number(zoneFilter.city_id) !== Number(cityFilter.city_id)
  ) {
    throw {
      status: 400,
      message: 'zone_id does not belong to the selected city_id',
    };
  }

  return {
    ...cityFilter,
    ...zoneFilter,
    // prefer explicit city filter over zone's city
    city_id: cityFilter.city_id,
    city_name: cityFilter.city_name,
  };
};

export const ORDER_ZONE_JOINS = `
  LEFT JOIN user_address_details uad ON uad.id = o.address_id
  LEFT JOIN pincodes p ON p.pincode = uad.pincode
  LEFT JOIN pincode_groups pg ON pg.id = p.pincode_group_id
`;

export const orderZoneCityFilterSql = (zoneParamIndex, cityParamIndex) =>
  `($${zoneParamIndex}::int IS NULL OR p.pincode_group_id = $${zoneParamIndex}::int)
   AND ($${cityParamIndex}::int IS NULL OR pg.city_id = $${cityParamIndex}::int)`;

export const userZoneCityExistsSql = (zoneParamIndex, cityParamIndex) =>
  `(
    $${zoneParamIndex}::int IS NULL AND $${cityParamIndex}::int IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM user_address_details uad
    JOIN pincodes p ON p.pincode = uad.pincode
    JOIN pincode_groups pg ON pg.id = p.pincode_group_id
    WHERE uad.user_id = u.id
      AND ($${zoneParamIndex}::int IS NULL OR p.pincode_group_id = $${zoneParamIndex}::int)
      AND ($${cityParamIndex}::int IS NULL OR pg.city_id = $${cityParamIndex}::int)
  )`;

export const scheduleMatchesZone = (shiftSchedule = [], pincodeGroupId) => {
  if (pincodeGroupId == null) return true;
  return shiftSchedule.some(
    (entry) => Number(entry.pincode_group_id) === Number(pincodeGroupId),
  );
};

export const scheduleMatchesCity = (shiftSchedule = [], cityId) => {
  if (cityId == null) return true;
  return shiftSchedule.some(
    (entry) =>
      entry.city_id != null && Number(entry.city_id) === Number(cityId),
  );
};

export const scheduleMatchesGeo = (
  shiftSchedule = [],
  { pincodeGroupId = null, cityId = null } = {},
) =>
  scheduleMatchesZone(shiftSchedule, pincodeGroupId) &&
  scheduleMatchesCity(shiftSchedule, cityId);
