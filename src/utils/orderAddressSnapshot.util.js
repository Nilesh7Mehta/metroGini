/**
 * Freeze delivery address on the order so later address edit/delete
 * cannot change pickup/delivery location or pincode for that order.
 */

export const ADDRESS_SNAPSHOT_KEYS = [
  "address_type",
  "complete_address",
  "floor",
  "landmark",
  "receiver_name",
  "contact_number",
  "latitude",
  "longitude",
  "pincode",
];

export const buildAddressSnapshot = (row = {}) => {
  if (!row) return null;

  const snapshot = {
    address_type: row.address_type ?? null,
    complete_address: row.complete_address ?? null,
    floor: row.floor ?? null,
    landmark: row.landmark ?? null,
    receiver_name: row.receiver_name ?? null,
    contact_number: row.contact_number ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    pincode: row.pincode != null ? String(row.pincode) : null,
  };

  if (!snapshot.complete_address && !snapshot.pincode) return null;
  return snapshot;
};

export const fetchAddressSnapshotById = async (db, addressId) => {
  const id = Number(addressId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { rows } = await db.query(
    `SELECT address_type, complete_address, floor, landmark,
            receiver_name, contact_number, latitude, longitude, pincode
     FROM user_address_details
     WHERE id = $1`,
    [id],
  );

  return buildAddressSnapshot(rows[0]);
};

/** Persist snapshot for an order from its current address_id (or explicit addressId). */
export const syncOrderAddressSnapshot = async (db, orderId, addressId = null) => {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) return null;

  let targetAddressId = addressId;
  if (targetAddressId == null) {
    const { rows } = await db.query(
      `SELECT address_id FROM orders WHERE id = $1`,
      [id],
    );
    targetAddressId = rows[0]?.address_id;
  }

  const snapshot = await fetchAddressSnapshotById(db, targetAddressId);
  if (!snapshot) return null;

  await db.query(
    `UPDATE orders
     SET address_snapshot = $1::jsonb, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(snapshot), id],
  );

  return snapshot;
};

/**
 * SQL expressions: prefer frozen snapshot, else live address join alias.
 * @param {string} liveAlias e.g. 'a' or 'uad'
 * @param {string} orderAlias e.g. 'o'
 */
export const addressSnapshotSelectSql = (liveAlias = "a", orderAlias = "o") => `
  COALESCE(${orderAlias}.address_snapshot->>'complete_address', ${liveAlias}.complete_address) AS complete_address,
  COALESCE(${orderAlias}.address_snapshot->>'pincode', ${liveAlias}.pincode) AS pincode,
  COALESCE(
    NULLIF(${orderAlias}.address_snapshot->>'latitude', '')::double precision,
    ${liveAlias}.latitude
  ) AS latitude,
  COALESCE(
    NULLIF(${orderAlias}.address_snapshot->>'longitude', '')::double precision,
    ${liveAlias}.longitude
  ) AS longitude,
  COALESCE(${orderAlias}.address_snapshot->>'floor', ${liveAlias}.floor) AS address_floor,
  COALESCE(${orderAlias}.address_snapshot->>'landmark', ${liveAlias}.landmark) AS address_landmark,
  COALESCE(${orderAlias}.address_snapshot->>'receiver_name', ${liveAlias}.receiver_name) AS address_receiver_name,
  COALESCE(${orderAlias}.address_snapshot->>'contact_number', ${liveAlias}.contact_number) AS address_contact_number,
  COALESCE(${orderAlias}.address_snapshot->>'address_type', ${liveAlias}.address_type) AS address_type
`;
