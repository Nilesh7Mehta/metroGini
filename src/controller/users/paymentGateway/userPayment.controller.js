import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import { generateOTP } from "../../../utils/otp.js";

export const dummyPay = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;

    // 1️⃣ Validate order + get address_id
    const orderCheck = await client.query(
      `SELECT id, estimated_total, pickup_date, address_id
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

    const { address_id } = orderCheck.rows[0];

    // 2️⃣ Get pincode
    const addressRes = await client.query(
      `SELECT pincode FROM user_address_details WHERE id = $1`,
      [address_id]
    );

    if (addressRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Address not found",
      });
    }

    const pincode = addressRes.rows[0].pincode;

    // 3️⃣ Static vendors (MVP)
    const vendors = [
      { pincode: "400001", vendor_id: 101 },
      { pincode: "400010", vendor_id: 102 },
      { pincode: "400650", vendor_id: 103 },
      { pincode: "400080", vendor_id: 104 }
    ];

    // 4️⃣ Find closest vendor
    let closestVendor = null;
    let minDiff = Infinity;

    vendors.forEach(v => {
      const diff = Math.abs(Number(pincode) - Number(v.pincode));

      if (diff < minDiff) {
        minDiff = diff;
        closestVendor = v;
      }
    });

    // 5️⃣ Optional safety check (MVP but important)
    const MAX_DIFF = 100; // adjust if needed

    if (!closestVendor || minDiff > MAX_DIFF) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Service not available in your area",
      });
    }
    console.log("Closetst" , closestVendor);

    const vendor_id = closestVendor.vendor_id;

    const advanceAmount = 500;

    // 6️⃣ Update order
    await client.query(
      `UPDATE orders
       SET status = 'booked',
           payment_status = 'partially_paid',
           vendor_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [order_id, vendor_id]
    );

    // 7️⃣ Insert payment
    await client.query(
      `INSERT INTO payments
       (order_id, amount, payment_type, payment_method, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, advanceAmount, "advance", "UPI", "success"]
    );

    // 8️⃣ Commit
    await client.query("COMMIT");

    // Notify user — order confirmed
    await createNotificationsBatch([{
      identity_id: user_id,
      role: 'user',
      title: 'Order Confirmed',
      message: `Your order #${order_id} has been confirmed and advance payment of ₹${advanceAmount} received. We will assign a rider for pickup.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    // Notify vendor — new order assigned
    await createNotificationsBatch([{
      identity_id: vendor_id,
      role: 'vendor',
      title: 'New Order Assigned',
      message: `Order #${order_id} has been assigned to your laundry. A rider will deliver it to you on the pickup date.`,
      reference_type: 'order',
      reference_id: order_id,
    }]);

    return res.status(200).json({
      message: "Payment successful. Order booked.",
      order_id,
      assigned_vendor: vendor_id,
      user_pincode: pincode,
      advance_paid: advanceAmount,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
};
