import sql from '../../config/db.js';
import { APP_USER_ROLE } from '../../utils/adminUser.util.js';

const formatCustomerId = (userId) => `CUST${String(userId).padStart(3, '0')}`;

const parseCustomerId = (rawId) => {
  const value = String(rawId || '').trim();
  if (!value) {
    throw { status: 400, message: 'Customer id is required' };
  }

  const custMatch = value.match(/^CUST0*(\d+)$/i);
  if (custMatch) {
    return Number(custMatch[1]);
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw { status: 400, message: 'Invalid customer id' };
  }

  return numeric;
};

const mapAddress = (row) => ({
  id: Number(row.id),
  address_type: row.address_type || null,
  complete_address: row.complete_address || null,
  floor: row.floor || null,
  landmark: row.landmark || null,
  receiver_name: row.receiver_name || null,
  contact_number: row.contact_number || null,
  latitude: row.latitude != null ? Number(row.latitude) : null,
  longitude: row.longitude != null ? Number(row.longitude) : null,
  pincode: row.pincode || null,
  is_selected: Boolean(row.is_selected),
  is_active: row.is_active != null ? Boolean(row.is_active) : true,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

export const getAdminCustomerDetailsService = async (rawId) => {
  const userId = parseCustomerId(rawId);

  const userResult = await sql.query(
    `SELECT id, mobile, full_name, email, gender, alternate_phone,
            profile_image, profile_completed, terms_and_condition,
            push_notification, status, created_at, updated_at
     FROM users
     WHERE id = $1 AND role = $2`,
    [userId, APP_USER_ROLE],
  );

  if (!userResult.rows.length) {
    throw { status: 404, message: 'Customer not found' };
  }

  const user = userResult.rows[0];

  const addressResult = await sql.query(
    `SELECT id, address_type, complete_address, floor, landmark, receiver_name,
            contact_number, latitude, longitude, pincode, is_selected, is_active,
            created_at, updated_at
     FROM user_address_details
     WHERE user_id = $1
     ORDER BY is_selected DESC NULLS LAST, id DESC`,
    [userId],
  );

  const orderStats = await sql.query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('draft', 'cancelled'))::int AS total_orders,
       COALESCE(
         SUM(COALESCE(final_total, estimated_total, 0))
           FILTER (WHERE status NOT IN ('draft', 'cancelled')),
         0
       ) AS total_spend,
       MAX(COALESCE(delivered_at, created_at))
         FILTER (WHERE status NOT IN ('draft', 'cancelled')) AS last_order_at
     FROM orders
     WHERE user_id = $1`,
    [userId],
  );

  const stats = orderStats.rows[0] || {};

  return {
    id: Number(user.id),
    customer_id: formatCustomerId(user.id),
    full_name: user.full_name || null,
    name: user.full_name || null,
    email: user.email || null,
    mobile: user.mobile || null,
    phone_number: user.mobile || null,
    gender: user.gender || null,
    alternate_phone: user.alternate_phone || null,
    profile_image: user.profile_image || null,
    profile_completed: Boolean(user.profile_completed),
    terms_and_condition: Boolean(user.terms_and_condition),
    push_notification: Boolean(user.push_notification),
    status: user.status || 'active',
    registered_at: user.created_at || null,
    updated_at: user.updated_at || null,
    total_orders: Number(stats.total_orders || 0),
    total_spend: Math.round(Number(stats.total_spend || 0)),
    last_order_date: stats.last_order_at || null,
    addresses: addressResult.rows.map(mapAddress),
  };
};
