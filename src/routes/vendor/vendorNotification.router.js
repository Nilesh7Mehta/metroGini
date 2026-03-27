import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import * as vendorNotificationController from '../../controller/vendor/vendorNotification.controller.js';

router.get('/', authenticate, vendorNotificationController.getNotifications);
router.get('/unread-count', authenticate, vendorNotificationController.getUnreadCount);
router.patch('/read-all', authenticate, vendorNotificationController.markAllAsRead);
router.patch('/:notification_id/read', authenticate, vendorNotificationController.markAsRead);

export default router;
