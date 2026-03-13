import sql from '../../config/db.js';
export const assignOrdersToRider = async (rider_id) => {

  const { rows: riderCount } = await sql.query(
    `SELECT COUNT(*) AS total
     FROM riders
     WHERE is_active = true
     AND shift_id IS NOT NULL`
  );

  const onlineRiders = parseInt(riderCount[0].total);

  const { rows: orderCount } = await sql.query(
    `SELECT COUNT(*) AS total
     FROM orders
     WHERE pickup_date = CURRENT_DATE
     AND assigned_rider_id IS NULL`
  );

  const totalOrders = parseInt(orderCount[0].total);

  if (totalOrders === 0) return [];

  const ordersPerRider = Math.ceil(totalOrders / onlineRiders);

  const { rows: orders } = await sql.query(
  `SELECT id
   FROM orders
   WHERE pickup_date = CURRENT_DATE
   AND assigned_rider_id IS NULL
   ORDER BY created_at
   LIMIT $1
   FOR UPDATE SKIP LOCKED`,
  [ordersPerRider]
);

  const orderIds = orders.map(o => o.id);

  if (orderIds.length === 0) return [];

  await sql.query(
    `UPDATE orders
     SET assigned_rider_id = $1
     WHERE id = ANY($2)`,
    [rider_id, orderIds]
  );

  return orderIds;
};