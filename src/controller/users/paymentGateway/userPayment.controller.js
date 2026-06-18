import sql from "../../../config/db.js";
import { createNotificationsBatch } from "../../../utils/notificationHelper.js";
import { reserveSlotCapacity } from "../../../services/common/slotAvailability.service.js";
import {
  createRazorpayOrderService,
  verifyRazorpayPaymentService,
} from "../../../services/users/userPayment.service.js";

const formatDate = (date) => {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toLocaleDateString("en-CA");
};


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

    const { address_id, pickup_date } = orderCheck.rows[0];

    if (!pickup_date) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Pickup date is required before payment",
      });
    }

    const slotDate = formatDate(pickup_date);


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

    const { group_code, shift_id, days, day_of_week } = req.body;
    const resolvedDay = day_of_week ?? days;

    if (!group_code?.trim()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "group_code is required" });
    }

    const shiftId = Number(shift_id);
    const dayOfWeek = Number(resolvedDay);

    if (!Number.isInteger(shiftId) || shiftId <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "shift_id must be a positive integer" });
    }

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "day_of_week must be between 1 (Monday) and 7 (Sunday)",
      });
    }

    const groupRes = await client.query(
      `SELECT id FROM pincode_groups WHERE group_code = $1`,
      [group_code.trim()],
    );

    if (groupRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Invalid group_code" });
    }

    const pincode_group_id = groupRes.rows[0].id;

    const vendorRes = await client.query(
      `SELECT laundry_id
       FROM laundry_group_shift_schedule
       WHERE pincode_group_id = $1
         AND day_of_week = $2
         AND shift_id = $3`,
      [pincode_group_id, dayOfWeek, shiftId],
    );

    if (vendorRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "No vendor scheduled for this group, day, and shift",
      });
    }

    const vendor_id = vendorRes.rows[0].laundry_id;

    const riderRes = await client.query(
      `SELECT rider_id
       FROM rider_group_shift_schedule
       WHERE pincode_group_id = $1
         AND day_of_week = $2
         AND shift_id = $3`,
      [pincode_group_id, dayOfWeek, shiftId],
    );

    if (riderRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "No rider scheduled for this group, day, and shift",
      });
    }

    const rider_id = riderRes.rows[0].rider_id;

    await reserveSlotCapacity(client, {
      laundryId: vendor_id,
      slotDate,
      shiftId,
    });

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

    // update status to confirmed
    await client.query(
      `UPDATE orders
       SET status = 'booked'
       WHERE id = $1`,
      [order_id]
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
      message: `Your order #${order_id} has been confirmed and advance payment of ₹${advanceAmount} received. A rider has been assigned for pickup.`,
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
      assigned_rider: rider_id,
      user_pincode: pincode,
      advance_paid: advanceAmount,
    });

  } catch (error) {
    await client.query("ROLLBACK");
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  } finally {
    client.release();
  }
};
