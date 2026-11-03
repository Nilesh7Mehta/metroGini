import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import { isVendor } from '../../middleware/checkRole.middleware.js';
import { createConfirmWeightUploader } from '../../middleware/upload.js';
import * as vendorOrderController from '../../controller/vendor/vendorOrder.controller.js';

const confirmWeightUpload = createConfirmWeightUploader(2 * 1024 * 1024);

router.get('/orderDashboard', authenticate, isVendor, vendorOrderController.orderDashboard);
router.get('/orderList', authenticate, isVendor, vendorOrderController.getVendorOrders);
router.get('/:order_id', authenticate, isVendor, vendorOrderController.getOrderDetails);
router.post('/:order_id/confirm-clothes', authenticate, isVendor, vendorOrderController.confirmClothes);
router.post(
  '/:order_id/confirm-weight',
  authenticate,
  isVendor,
  confirmWeightUpload,
  vendorOrderController.confirmWeight,
);
router.post('/:order_id/finalize', authenticate, isVendor, vendorOrderController.finalizeOrder);
router.post('/:order_id/mark-ready', authenticate, isVendor, vendorOrderController.markReadyForDelivery);

export default router;
