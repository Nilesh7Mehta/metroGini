import sql from '../../config/db.js';

export const getUserNotificationsService = async (userId, { category, page, limit }) => {
  const offset = (page - 1) * limit;

  const conditions = [`n.identity_id = $1`, `n.role = 'user'`];
  const params = [userId];

  if (category === 'orders') {
    conditions.push(`n.reference_type = 'order'`);
  } else if (category === 'auth') {
    conditions.push(`n.reference_type = 'auth'`);
  }

  const where = conditions.join(' AND ');

  const [dataResult, countResult] = await Promise.all([
    sql.query(
      `SELECT id, title, message, reference_type, reference_id, is_read, created_at
       FROM notifications n
       WHERE ${where}
       ORDER BY id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    sql.query(`SELECT COUNT(*) FROM notifications n WHERE ${where}`, params),
  ]);

  return {
    notifications: dataResult.rows,
    pagination: {
      total: parseInt(countResult.rows[0].count, 10),
      page,
      limit,
      total_pages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit) || 0,
    },
  };
};

export const markUserNotificationReadService = async (userId, notificationId) => {
  const result = await sql.query(
    `DELETE FROM notifications
     WHERE id = $1 AND identity_id = $2 AND role = 'user'
     RETURNING id`,
    [notificationId, userId],
  );

  if (result.rows.length === 0) {
    throw { status: 404, message: 'Notification not found' };
  }

  return {
    notification_id: parseInt(notificationId, 10),
    deleted: true,
  };
};

export const markAllUserNotificationsReadService = async (userId) => {
  const result = await sql.query(
    `DELETE FROM notifications
     WHERE identity_id = $1 AND role = 'user'`,
    [userId],
  );

  return { deleted: result.rowCount };
};

export const getUserUnreadCountService = async (userId) => {
  const result = await sql.query(
    `SELECT COUNT(*) FROM notifications
     WHERE identity_id = $1 AND role = 'user'`,
    [userId],
  );

  return { unread_count: parseInt(result.rows[0].count, 10) };
};
