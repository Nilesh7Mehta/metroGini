import sql from '../../config/db.js';

export const getTodayOrderList = async (req, res, next) => {
  try {

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (page <= 0 || limit <= 0) {
      return res.status(400).json({
        status: false,
        message: "Invalid pagination values"
      });
    }

    const offset = (page - 1) * limit;

    const today = new Date().toISOString().split("T")[0];
    console.log("Today" , today);

    const { rows } = await sql.query(
      `SELECT 
        o.id,
        o.status,
        o.created_at,
        u.full_name AS customer_name,
        u.id AS customer_id,
        s.name AS service_name,
        st.name AS service_type,
        uad.address_type,
        uad.complete_address,
        uad.landmark,
        ts.start_time,
        ts.end_time
      FROM orders o
      INNER JOIN payments p ON p.order_id = o.id
      INNER JOIN users u ON u.id = o.user_id
      INNER JOIN services s ON s.id = o.service_id
      INNER JOIN service_types st ON st.id = o.service_type_id
      INNER JOIN user_address_details uad ON uad.id = o.address_id
      INNER JOIN time_slots ts ON ts.id = o.pickup_slot_id
      WHERE o.pickup_date >= $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3`,
      [today, limit, offset]
    );

    return res.status(200).json({
      status: true,
      page,
      limit,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("Get Today Orders Error:", error);
    next(error);
  }
};