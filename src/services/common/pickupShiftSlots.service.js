import sql from '../../config/db.js';

const buildShiftMeta = (shiftName) => {
  const shift_type = String(shiftName).trim().toLowerCase();
  const titleLabel = shift_type.charAt(0).toUpperCase() + shift_type.slice(1);

  return {
    id: `${shift_type}_shift`,
    shift_type,
    title_prefix: `${titleLabel} Shift`,
  };
};

/** Active pickup shifts from time_slots (id + shift_name). */
export const getPickupShiftConfig = async () => {
  const { rows } = await sql.query(
    `SELECT id, shift_name
     FROM time_slots
     WHERE is_active = TRUE AND shift_name IS NOT NULL
     ORDER BY start_time ASC, id ASC`,
  );

  const pickupShiftSlotIds = rows.map((row) => row.id);
  const shiftByPickupSlot = Object.fromEntries(
    rows.map((row) => [row.id, buildShiftMeta(row.shift_name)]),
  );

  return { pickupShiftSlotIds, shiftByPickupSlot };
};
