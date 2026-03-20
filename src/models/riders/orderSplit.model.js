import sql from "../../config/db.js";

export const assignNextDayOrders = async () => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Get all riders (SHIFT BASED, not active)
    const { rows: riders } = await client.query(
      `SELECT id, shift_id
       FROM riders 
       WHERE shift_id IS NOT NULL`,
    );

    if (riders.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    // 2️⃣ Group riders by shift
    const ridersByShift = {};

    riders.forEach((r) => {
      if (!ridersByShift[r.shift_id]) {
        ridersByShift[r.shift_id] = [];
      }
      ridersByShift[r.shift_id].push(r.id);
    });

    // 3️⃣ Process each shift
    for (const shift_id in ridersByShift) {
      const riderIds = ridersByShift[shift_id];

      // Get shift timing
      const shiftRes = await client.query(
        `SELECT start_time, end_time FROM shifts WHERE id = $1`,
        [shift_id],
      );

      const { start_time, end_time } = shiftRes.rows[0];

      // 4️⃣ Get NEXT DAY orders 🔥
      const { rows: orders } = await client.query(
        `SELECT o.id
         FROM orders o
         JOIN time_slots ts ON ts.id = o.pickup_slot_id
         WHERE o.pickup_date = CURRENT_DATE + INTERVAL '1 day'
           AND o.assigned_rider_id IS NULL
           AND o.status = 'out_for_pickup'
           AND ts.start_time < $2
           AND ts.end_time > $1
         ORDER BY o.created_at
         FOR UPDATE SKIP LOCKED`,
        [start_time, end_time],
      );

      if (orders.length === 0) continue;

      const totalOrders = orders.length;
      const totalRiders = riderIds.length;

      const ordersPerRider = Math.ceil(totalOrders / totalRiders);

      let index = 0;

      // 5️⃣ Split and assign
      for (const rider_id of riderIds) {
        const chunk = orders.slice(index, index + ordersPerRider);
        const orderIds = chunk.map((o) => o.id);

        if (orderIds.length === 0) continue;

        await client.query(
          `UPDATE orders
           SET assigned_rider_id = $1
           WHERE id = ANY($2)`,
          [rider_id, orderIds],
        );

        index += ordersPerRider;
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
