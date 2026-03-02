import express from 'express';
import * as userPaymentGatewayController from '../../controller/users/paymentGateway/userPayment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { isUser } from '../../middleware/checkRole.middleware.js';

const router = express.Router();

// Apply authentication + role check to all routes below
router.use(authenticate);
router.use(isUser);

router.post('/:id/pay' , userPaymentGatewayController.dummyPay);

export default router;