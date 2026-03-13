import sql from '../../config/db.js';

export const checkRiderReady = async (rider_id) => {

  const { rows } = await sql.query(
    `SELECT id
     FROM riders
     WHERE id = $1
     AND shift_id IS NOT NULL`,
    [rider_id]
  );

  return rows.length > 0;
};