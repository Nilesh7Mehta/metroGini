import {
  getVendorNotificationsService,
  markNotificationReadService,
  markAllNotificationsReadService,
  getUnreadCountService,
} from '../../services/vendor/vendorNotification.service.js';

// GET /api/vendor/notifications?category=all|orders|rider&page=1&limit=20
export const getNotifications = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const category = ['orders', 'rider'].includes(req.query.category) ? req.query.category : 'all';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const data = await getVendorNotificationsService(vendor_id, { category, page, limit });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// GET /api/vendor/notifications/unread-count
export const getUnreadCount = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const data = await getUnreadCountService(vendor_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/vendor/notifications/:notification_id/read
export const markAsRead = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const { notification_id } = req.params;

    const data = await markNotificationReadService(vendor_id, notification_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/vendor/notifications/read-all
export const markAllAsRead = async (req, res, next) => {
  try {
    const vendor_id = req.user.vendor_id;
    const data = await markAllNotificationsReadService(vendor_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
