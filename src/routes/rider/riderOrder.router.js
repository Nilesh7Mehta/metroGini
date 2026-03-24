import express from 'express';
import * as riderOrderController from '../../controller/rider/order.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { sendOtpLimiter, verifyOtpLimiter } from '../../middleware/rateLimiter.js';
const router = express.Router();
router.get('/getTodayOrder' , authenticate , riderOrderController.getTodayOrderList);
router.get('/getDashboardCount' , authenticate , riderOrderController.getDashboardCount);

//start delivery
router.post('/:id/startOrderDelivery', authenticate, riderOrderController.startOrderDelivery);
router.post('/verifyPickupOtp', authenticate, verifyOtpLimiter, riderOrderController.verifyPickupOtp);
router.post('/resendPickupOtp', authenticate, sendOtpLimiter, riderOrderController.resendPickupOtp);
router.post('/handOverOrder', authenticate, riderOrderController.handoverToVendor);
router.post('/collectPayment', authenticate, riderOrderController.collectPayment);
router.post('/pickupFromVendor', authenticate, riderOrderController.pickupFromVendor);
router.post('/completeDelivery', authenticate, verifyOtpLimiter, riderOrderController.completeDelivery);

//getOrderHistory
router.get('/getOrderHistory' , authenticate , riderOrderController.getOrderHistory);


export default router;