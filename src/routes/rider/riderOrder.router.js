import express from 'express';
import * as riderOrderController from '../../controller/rider/order.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { isRider } from '../../middleware/checkRole.middleware.js';
import { sendOtpLimiter, verifyOtpLimiter } from '../../middleware/rateLimiter.js';
const router = express.Router();
router.get('/getTodayOrder' , authenticate , isRider, riderOrderController.getTodayOrderList);
router.get('/getTodayDeliveryOrders', authenticate, isRider, riderOrderController.getTodayDeliveryOrderList);
router.get('/orderDetail/:id', authenticate, isRider, riderOrderController.getRiderOrderDetail);
router.get('/optimizedRoute', authenticate, isRider, riderOrderController.getOptimizedRoute);
router.get('/getDashboardCount' , authenticate , isRider, riderOrderController.getDashboardCount);

//start delivery
router.post('/:id/startOrderDelivery', authenticate, isRider, riderOrderController.startOrderDelivery);
router.post('/verifyPickupOtp', authenticate, isRider, verifyOtpLimiter, riderOrderController.verifyPickupOtp);
router.post('/resendPickupOtp', authenticate, isRider, sendOtpLimiter, riderOrderController.resendPickupOtp);
router.post('/handOverOrder', authenticate, isRider, riderOrderController.handoverToVendor);
router.post('/collectPayment', authenticate, isRider, riderOrderController.collectPayment);
router.post('/:id/create-payment-order', authenticate, isRider, riderOrderController.createPaymentOrder);
router.post('/pickupFromVendor', authenticate, isRider, riderOrderController.pickupFromVendor);
router.post('/completeDelivery', authenticate, isRider, verifyOtpLimiter, riderOrderController.completeDelivery);

//getOrderHistory
router.get('/getOrderHistory' , authenticate , isRider, riderOrderController.getOrderHistory);
router.get('/missedPickups', authenticate, isRider, riderOrderController.getMissedPickups);
router.get('/missedDrops', authenticate, isRider, riderOrderController.getMissedDrops);


export default router;
