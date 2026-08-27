import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { isUser } from '../../middleware/checkRole.middleware.js';
import * as userNotificationController from '../../controller/users/userNotification.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(isUser);

router.get('/', userNotificationController.getNotifications);
router.get('/unread-count', userNotificationController.getUnreadCount);
router.patch('/read-all', userNotificationController.markAllAsRead);
router.patch('/:notification_id/read', userNotificationController.markAsRead);

export default router;
