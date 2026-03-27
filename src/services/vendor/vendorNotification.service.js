import sql from '../../config/db.js';

export const getVendorNotificationsService = async (vendor_id, { category, page, limit }) => {
  const offset = (page - 1) * limit;

  const conditions = [`n.identity_id = $1`, `n.role = 'vendor'`];
  const params = [vendor_id];

  if (category === 'orders') {
    conditions.push(`n.reference_type = 'order'`);
  } else if (category === 'rider') {
    conditions.push(`n.reference_type = 'rider'`);
  }

  const where = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    sql.query(
      `SELECT id, title, message, reference_type, reference_id, is_read, created_at
       FROM notifications n
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    sql.query(`SELECT COUNT(*) FROM notifications n WHERE ${where}`, params),
  ]);

  return {
    notifications: dataResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      total_pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
    },
  };
};

export const markNotificationReadService = async (vendor_id, notification_id) => {
  const result = await sql.query(
    `UPDATE notifications SET is_read = true
     WHERE id = $1 AND identity_id = $2 AND role = 'vendor'
     RETURNING id`,
    [notification_id, vendor_id]
  );

  if (result.rows.length === 0) throw { status: 404, message: 'Notification not found' };

  return { notification_id: parseInt(notification_id), is_read: true };
};

export const markAllNotificationsReadService = async (vendor_id) => {
  const result = await sql.query(
    `UPDATE notifications SET is_read = true
     WHERE identity_id = $1 AND role = 'vendor' AND is_read = false`,
    [vendor_id]
  );

  return { updated: result.rowCount };
};

export const getUnreadCountService = async (vendor_id) => {
  const result = await sql.query(
    `SELECT COUNT(*) FROM notifications
     WHERE identity_id = $1 AND role = 'vendor' AND is_read = false`,
    [vendor_id]
  );

  return { unread_count: parseInt(result.rows[0].count) };
};
