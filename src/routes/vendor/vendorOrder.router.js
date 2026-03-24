import express from 'express';
const router = express.Router();
import { authenticate } from '../../middleware/auth.middleware.js';
import * as vendorOrderController from '../../controller/vendor/vendorOrder.controller.js';

router.get('/orderDashboard', authenticate, vendorOrderController.orderDashboard);

export default router;