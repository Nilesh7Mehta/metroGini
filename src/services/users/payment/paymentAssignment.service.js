import { throwHttpError } from "./razorpay.util.js";

export const resolveVendorAndRider = async (
  client,
  { group_code, shift_id, day_of_week, address_id },
) => {
  const shiftId = Number(shift_id);
  const dayOfWeek = Number(day_of_week);

  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    throwHttpError("shift_id missing or invalid in payment notes");
  }

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    throwHttpError("day_of_week missing or invalid in payment notes");
  }

  let pincode_group_id;

  if (group_code) {
    const groupRes = await client.query(
      `SELECT id FROM pincode_groups WHERE group_code = $1`,
      [group_code],
    );
    if (groupRes.rows.length === 0) throwHttpError("Invalid group_code in payment notes");
    pincode_group_id = groupRes.rows[0].id;
  } else {
    const addressRes = await client.query(
      `SELECT p.pincode_group_id
       FROM user_address_details uad
       LEFT JOIN pincodes p ON p.pincode = uad.pincode
       WHERE uad.id = $1`,
      [address_id],
    );
    if (!addressRes.rows[0]?.pincode_group_id) {
      throwHttpError("Could not resolve pincode group for order address");
    }
    pincode_group_id = addressRes.rows[0].pincode_group_id;
  }

  const vendorRes = await client.query(
    `SELECT laundry_id FROM laundry_group_shift_schedule
     WHERE pincode_group_id = $1 AND day_of_week = $2 AND shift_id = $3`,
    [pincode_group_id, dayOfWeek, shiftId],
  );
  if (vendorRes.rows.length === 0) {
    throwHttpError("No vendor scheduled for this group, day, and shift");
  }

  const riderRes = await client.query(
    `SELECT rider_id FROM rider_group_shift_schedule
     WHERE pincode_group_id = $1 AND day_of_week = $2 AND shift_id = $3`,
    [pincode_group_id, dayOfWeek, shiftId],
  );
  if (riderRes.rows.length === 0) {
    throwHttpError("No rider scheduled for this group, day, and shift");
  }

  return {
    vendor_id: vendorRes.rows[0].laundry_id,
    rider_id: riderRes.rows[0].rider_id,
    shift_id: shiftId,
  };
};
