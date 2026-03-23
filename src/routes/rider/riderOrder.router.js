import express from 'express';
import * as riderOrderController from '../../controller/rider/order.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { sendOtpLimiter, verifyOtpLimiter } from '../../middleware/rateLimiter.js';
const router = express.Router();
router.get('/getTodayOrder' , authenticate , riderOrderController.getTodayOrderList);
router.get('/getDashboardCount' , authenticate , riderOrderController.getDashboardCount);

//start delivery
router.post('/:id/startOrderDelivery' , authenticate , riderOrderController.startOrderDelivery);
router.post('/verifyDeliveryOtp', authenticate, verifyOtpLimiter , riderOrderController.verifyDeliveryOtp);
router.post('/resendDeliveryOtp', authenticate, sendOtpLimiter, riderOrderController.resendDeliveryOtp);
router.post('/handOverOrder', authenticate, riderOrderController.handoverToVendor);

//getOrderHistory
router.get('/getOrderHistory' , authenticate , riderOrderController.getOrderHistory);


export default router;