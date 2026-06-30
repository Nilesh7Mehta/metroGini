import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import { createUploader } from '../../middleware/upload.js';
import * as vendorOrderController from '../../controller/vendor/vendorOrder.controller.js';

const stainUpload = createUploader('order-stains', 2 * 1024 * 1024);

router.get('/orderDashboard', authenticate, vendorOrderController.orderDashboard);
router.get('/orderList', authenticate, vendorOrderController.getVendorOrders);
router.get('/:order_id', authenticate, vendorOrderController.getOrderDetails);
router.post('/:order_id/confirm-clothes', authenticate, vendorOrderController.confirmClothes);
router.post('/:order_id/confirm-weight', authenticate, stainUpload.single('image'), vendorOrderController.confirmWeight);
router.post('/:order_id/finalize', authenticate, vendorOrderController.finalizeOrder);
router.post('/:order_id/mark-ready', authenticate, vendorOrderController.markReadyForDelivery);

export default router;