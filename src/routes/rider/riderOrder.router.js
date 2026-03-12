import express from 'express';
import * as riderOrderController from '../../controller/rider/order.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
const router = express.Router();
router.get('/getTodayOrder' , authenticate , riderOrderController.getTodayOrderList);

export default router;