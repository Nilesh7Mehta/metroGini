
import sql from "../../../config/db.js";

export const dummyPay = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;

    // 1️⃣ Validate order
    const orderCheck = await client.query(
      `SELECT id, estimated_total
       FROM orders
       WHERE id = $1
         AND user_id = $2
         AND status = 'draft'
       FOR UPDATE`,
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Order not found or already paid"
      });
    }

    const advanceAmount = 500; // fake fixed advance

    // 2️⃣ Update order status
    await client.query(
      `UPDATE orders
       SET status = 'booked',
           payment_status = 'partially_paid',
           updated_at = NOW()
       WHERE id = $1`,
      [order_id]
    );

    // 3️⃣ Insert payment record
    await client.query(
      `INSERT INTO payments
       (order_id, amount, payment_type, payment_method, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, advanceAmount, 'advance', 'UPI', 'success']
    );

    await client.query("COMMIT");

    return res.status(200).json({
      message: "Payment successful. Order booked.",
      order_id,
      advance_paid: advanceAmount
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};