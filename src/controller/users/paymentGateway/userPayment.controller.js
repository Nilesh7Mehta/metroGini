import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import { generateOTP } from "../../../utils/otp.js";

export const dummyPay = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;

    // 1️⃣ Validate order + get pickup_date
    const orderCheck = await client.query(
      `SELECT id, estimated_total, pickup_date
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
        message: "Order not found or already paid",
      });
    }

    const { estimated_total, pickup_date } = orderCheck.rows[0];

    const advanceAmount = 500; // fixed advance

    // 2️⃣ Update order to booked
    await client.query(
      `UPDATE orders
       SET status = 'booked',
           payment_status = 'partially_paid',
           updated_at = NOW()
       WHERE id = $1`,
      [order_id]
    );

    // 3️⃣ Insert advance payment
    await client.query(
      `INSERT INTO payments
       (order_id, amount, payment_type, payment_method, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, advanceAmount, "advance", "UPI", "success"]
    );

    // 4️⃣ Check if pickup is today
    const pickupDate = new Date(pickup_date);
    const today = new Date();

    if (pickupDate.toDateString() === today.toDateString()) {
  const otp = generateOTP();

  await client.query(
    `UPDATE orders
     SET pickup_otp = $1,
         otp_generated_at = NOW(),
         status = 'out_for_pickup'
     WHERE id = $2`,
    [otp, order_id]
  );

  console.log("OTP Generated:", otp);

  await createNotificationsBatch([
    {
      user_id,
      title: "MetroGini truck is on the way 🚚",
      message: "Our pickup truck will arrive soon to collect your laundry.",
      reference_type: "order",
      reference_id: order_id,
    },
    {
      user_id,
      title: "Laundry Pickup Confirmation",
      message: `Share OTP ${otp} with the rider to complete pickup.`,
      reference_type: "order",
      reference_id: order_id,
    },
    {
      user_id,
      title: "Pickup OTP",
      message: `Your pickup OTP is ${otp}`,
      reference_type: "order",
      reference_id: order_id,
    },
  ]);
}

 

    // 5️⃣ Commit transaction
    await client.query("COMMIT");

    return res.status(200).json({
      message: "Payment successful. Order booked.",
      order_id,
      advance_paid: advanceAmount,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
