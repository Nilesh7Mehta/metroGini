import express from 'express';
import * as riderOrderController from '../../controller/rider/order.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
const router = express.Router();
router.get('/getTodayOrder' , authenticate , riderOrderController.getTodayOrderList);
router.get('/getDashboardCount' , authenticate , riderOrderController.getDashboardCount);

//start delivery
router.post('/:id/startOrderDelivery' , authenticate , riderOrderController.startOrderDelivery);

export default router;