import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import { isVendor } from '../../middleware/checkRole.middleware.js';
import * as vendorNotificationController from '../../controller/vendor/vendorNotification.controller.js';

router.get('/', authenticate, isVendor, vendorNotificationController.getNotifications);
router.get('/unread-count', authenticate, isVendor, vendorNotificationController.getUnreadCount);
router.patch('/read-all', authenticate, isVendor, vendorNotificationController.markAllAsRead);
router.patch('/:notification_id/read', authenticate, isVendor, vendorNotificationController.markAsRead);

export default router;
