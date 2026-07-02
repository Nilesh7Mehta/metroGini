import express from 'express';
import * as userPaymentGatewayController from '../../controller/users/paymentGateway/userPayment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { isUser } from '../../middleware/checkRole.middleware.js';

const router = express.Router();

// Webhook — no auth (called by Razorpay)
router.post('/razorpay/webhook', userPaymentGatewayController.razorpayWebhook);

// Apply authentication + role check to all routes below
router.use(authenticate);
router.use(isUser);

router.post('/:id/pay' , userPaymentGatewayController.dummyPay);
//create order razor pay api
router.post('/:id/create-order', userPaymentGatewayController.createOrderRazorPay);
router.post('/:id/verify', userPaymentGatewayController.verifyOrderRazorPay);

export default router;