import sql from '../../config/db.js';

// export const assignOrdersToRider = async (rider_id) => {
//   const client = await sql.connect();

//   try {
//     await client.query("BEGIN");

//     // 1️⃣ Get rider shift
//     const riderRes = await client.query(
//       `SELECT shift_id FROM riders WHERE id = $1`,
//       [rider_id]
//     );

//     if (riderRes.rows.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     const shift_id = riderRes.rows[0].shift_id;
//     if (!shift_id) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 2️⃣ Get shift timing
//     const shiftRes = await client.query(
//       `SELECT start_time, end_time FROM shifts WHERE id = $1`,
//       [shift_id]
//     );

//     const { start_time, end_time } = shiftRes.rows[0];

//     // 3️⃣ Get eligible orders (LOCKED)
//     const { rows: orders } = await client.query(
//       `SELECT o.id
//        FROM orders o
//        JOIN time_slots ts ON ts.id = o.pickup_slot_id
//        WHERE o.pickup_date = CURRENT_DATE
//          AND o.assigned_rider_id IS NULL
//          AND o.status = 'out_for_pickup'
//          AND ts.start_time < $2
//          AND ts.end_time > $1
//        ORDER BY o.created_at
//        FOR UPDATE SKIP LOCKED`,
//       [start_time, end_time]
//     );

//     if (orders.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 4️⃣ Count active riders in same shift
//     const { rows: riderCount } = await client.query(
//       `SELECT COUNT(*) AS total
//        FROM riders
//        WHERE is_active = true
//        AND shift_id = $1`,
//       [shift_id]
//     );

//     const onlineRiders = parseInt(riderCount[0].total);
//     if (onlineRiders === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 5️⃣ Split logic
//     const totalOrders = orders.length;
//     const ordersPerRider = Math.ceil(totalOrders / onlineRiders);

//     const selectedOrders = orders.slice(0, ordersPerRider);
//     const orderIds = selectedOrders.map(o => o.id);

//     if (orderIds.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 6️⃣ Assign orders
//     await client.query(
//       `UPDATE orders
//        SET assigned_rider_id = $1
//        WHERE id = ANY($2)`,
//       [rider_id, orderIds]
//     );

//     // 7️⃣ Get full order details
//     const { rows: fullOrders } = await client.query(
//       `SELECT 
//           o.id,
//           o.pickup_date,
//           o.status,
//           ts.start_time,
//           ts.end_time,
//           u.full_name AS customer_name,
//           u.id,
//           a.complete_address , 
//           a.pincode 
//        FROM orders o
//        JOIN time_slots ts ON ts.id = o.pickup_slot_id
//        JOIN users u ON u.id = o.user_id
//        JOIN user_address_details a ON a.id = o.address_id
//        WHERE o.id = ANY($1)`,
//       [orderIds]
//     );

//     // 8️⃣ Commit
//     await client.query("COMMIT");

//     return fullOrders;

//   } catch (error) {
//     await client.query("ROLLBACK");
//     throw error;
//   } finally {
//     client.release();
//   }
// };


// export const assignOrdersToRider = async (rider_id) => {
//   const client = await sql.connect();

//   try {
//     await client.query("BEGIN");

//     const MAX_ORDERS_PER_RIDER = 5;

//     // 1️⃣ Get rider shift
//     const riderRes = await client.query(
//       `SELECT shift_id FROM riders WHERE id = $1`,
//       [rider_id]
//     );

//     if (riderRes.rows.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     const shift_id = riderRes.rows[0].shift_id;
//     if (!shift_id) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 2️⃣ Get shift timing
//     const shiftRes = await client.query(
//       `SELECT start_time, end_time FROM shifts WHERE id = $1`,
//       [shift_id]
//     );

//     const { start_time, end_time } = shiftRes.rows[0];

//     // 3️⃣ Check current rider load (IMPORTANT 🔥)
//     const { rows: currentOrders } = await client.query(
//       `SELECT COUNT(*) AS total
//        FROM orders
//        WHERE assigned_rider_id = $1
//        AND status IN ('out_for_pickup', 'active')`,
//       [rider_id]
//     );

//     const currentLoad = parseInt(currentOrders[0].total);
//     const remainingCapacity = MAX_ORDERS_PER_RIDER - currentLoad;

//     if (remainingCapacity <= 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 4️⃣ Get eligible orders (LOCKED 🔒)
//     const { rows: orders } = await client.query(
//       `SELECT o.id
//        FROM orders o
//        JOIN time_slots ts ON ts.id = o.pickup_slot_id
//        WHERE o.pickup_date = CURRENT_DATE
//          AND o.assigned_rider_id IS NULL
//          AND o.status = 'out_for_pickup'
//          AND ts.start_time < $2
//          AND ts.end_time > $1
//        ORDER BY o.created_at
//        FOR UPDATE SKIP LOCKED`,
//       [start_time, end_time]
//     );

//     if (orders.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 5️⃣ Assign only required orders (dynamic refill 🔥)
//     const selectedOrders = orders.slice(0, remainingCapacity);
//     const orderIds = selectedOrders.map(o => o.id);

//     if (orderIds.length === 0) {
//       await client.query("ROLLBACK");
//       return [];
//     }

//     // 6️⃣ Assign orders
//     await client.query(
//       `UPDATE orders
//        SET assigned_rider_id = $1
//        WHERE id = ANY($2)`,
//       [rider_id, orderIds]
//     );

//     // 7️⃣ Fetch full order details (for UI)
//     const { rows: fullOrders } = await client.query(
//       `SELECT 
//           o.id,
//           o.pickup_date,
//           o.status,
//           ts.start_time,
//           ts.end_time,
//           u.full_name AS customer_name,
//           u.id AS customer_id,
//           a.complete_address,
//           a.pincode
//        FROM orders o
//        JOIN time_slots ts ON ts.id = o.pickup_slot_id
//        JOIN users u ON u.id = o.user_id
//        JOIN user_address_details a ON a.id = o.address_id
//        WHERE o.id = ANY($1)`,
//       [orderIds]
//     );

//     await client.query("COMMIT");

//     return fullOrders;

//   } catch (error) {
//     await client.query("ROLLBACK");
//     throw error;
//   } finally {
//     client.release();
//   }
// };

export const assignNextDayOrders = async () => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Get all riders (SHIFT BASED, not active)
    const { rows: riders } = await client.query(
      `SELECT id, shift_id
       FROM riders 
       WHERE shift_id IS NOT NULL`
    );

    if (riders.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    // 2️⃣ Group riders by shift
    const ridersByShift = {};

    riders.forEach(r => {
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
        [shift_id]
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
        [start_time, end_time]
      );

      if (orders.length === 0) continue;

      const totalOrders = orders.length;
      const totalRiders = riderIds.length;

      const ordersPerRider = Math.ceil(totalOrders / totalRiders);

      let index = 0;

      // 5️⃣ Split and assign
      for (const rider_id of riderIds) {
        const chunk = orders.slice(index, index + ordersPerRider);
        const orderIds = chunk.map(o => o.id);

        if (orderIds.length === 0) continue;

        await client.query(
          `UPDATE orders
           SET assigned_rider_id = $1
           WHERE id = ANY($2)`,
          [rider_id, orderIds]
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