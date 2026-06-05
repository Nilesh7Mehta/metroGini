import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import { generateOTP } from "../../../utils/otp.js";


//Dummy Payment Gateway later on will replace with actual payment gateway (Razorpay, Stripe, etc.)
export const dummyPay = async (req, res, next) => {
  const client = await sql.connect();

  try {
    await client.query("BEGIN");

    const order_id = req.params.id;
    const user_id = req.user.id;

    // 1️⃣ Validate order (must be booked after complete-order/finalize, not yet paid)
    const orderCheck = await client.query(
      `SELECT id, estimated_total, pickup_date, address_id
       FROM orders
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [order_id, user_id]
    );

    if (orderCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Order not found, not ready for payment, or already paid",
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

    // 3️⃣ Fetch top vendor (primary active vendor)
    const topVendorRes = await client.query(
      `SELECT id
       FROM vendors
       WHERE is_active = true
       ORDER BY id ASC
       LIMIT 1`
    );

    if (topVendorRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "No vendors available",
      });
    }

    const vendor_id = topVendorRes.rows[0].id;

      // 3️⃣ Fetch top Rider (primary active rider)
      const topRiderRes = await client.query(
        `SELECT id
         FROM riders
         WHERE is_active = true
         ORDER BY id ASC
         LIMIT 1`
      );
  
      if (topRiderRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "No riders available",
        });
      }
  
      const rider_id = topRiderRes.rows[0].id;

    // // 3️⃣ Fetch active vendors with pincode
    // const vendorsRes = await client.query(
    //   `SELECT id, pincode
    //    FROM vendors
    //    WHERE is_active = true
    //      AND pincode IS NOT NULL`
    // );
    //
    // if (vendorsRes.rows.length === 0) {
    //   await client.query("ROLLBACK");
    //   return res.status(400).json({
    //     message: "No vendors available",
    //   });
    // }
    //
    // // 4️⃣ Find closest vendor
    // const maxPincodeDiff = Number(process.env.VENDOR_PINCODE_MAX_DIFF) || 100;
    //
    // let closestVendor = null;
    // let minDiff = Infinity;
    //
    // vendorsRes.rows.forEach((v) => {
    //   const diff = Math.abs(Number(pincode) - Number(v.pincode));
    //
    //   if (diff < minDiff) {
    //     minDiff = diff;
    //     closestVendor = v;
    //   }
    // });
    //
    // // 5️⃣ Service area check
    // if (!closestVendor || minDiff > maxPincodeDiff) {
    //   await client.query("ROLLBACK");
    //   return res.status(400).json({
    //     message: "Service not available in your area",
    //   });
    // }
    //
    // const vendor_id = closestVendor.id;

    const advanceAmount = 500;

    // 6️⃣ Record advance payment + assign vendor
    await client.query(
      `UPDATE orders
       SET payment_status = 'partially_paid',
           vendor_id = $2,
           assigned_rider_id = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [order_id, vendor_id, rider_id]
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
