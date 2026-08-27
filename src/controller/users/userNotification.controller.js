import {
  getUserNotificationsService,
  markUserNotificationReadService,
  markAllUserNotificationsReadService,
  getUserUnreadCountService,
} from '../../services/users/userNotification.service.js';

export const getNotifications = async (req, res, next) => {
  try {
    const category = ['orders', 'auth'].includes(req.query.category)
      ? req.query.category
      : 'all';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const data = await getUserNotificationsService(req.user.id, {
      category,
      page,
      limit,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = async (req, res, next) => {
  try {
    const data = await getUserUnreadCountService(req.user.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const data = await markUserNotificationReadService(
      req.user.id,
      req.params.notification_id,
    );
    return res.status(200).json({
      success: true,
      message: 'Notification removed',
      data,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

export const markAllAsRead = async (req, res, next) => {
  try {
    const data = await markAllUserNotificationsReadService(req.user.id);
    return res.status(200).json({
      success: true,
      message: 'All notifications cleared',
      data,
    });
  } catch (error) {
    next(error);
  }
};
