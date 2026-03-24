import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import * as vendorOrderController from '../../controller/vendor/vendorOrder.controller.js';

router.get('/orderDashboard', authenticate, vendorOrderController.orderDashboard);
router.get('/:order_id', authenticate, vendorOrderController.getOrderDetails);
router.post('/:order_id/confirm-clothes', authenticate, vendorOrderController.confirmClothes);
router.post('/:order_id/confirm-weight', authenticate, vendorOrderController.confirmWeight);
router.post('/:order_id/finalize', authenticate, vendorOrderController.finalizeOrder);

export default router;