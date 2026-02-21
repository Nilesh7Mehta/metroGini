import express from 'express';
import * as userOrderController from '../../controller/userOrder.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

//create draft order
router.post('/', authenticate, userOrderController.createDraftOrder);

//Step 2: Update service type for the draft order
router.put('/:id/service-type', authenticate, userOrderController.updateServiceType);

//step 3: update pickup 
router.put('/:id/pickup', authenticate, userOrderController.updatePickup);

//step 4: update dropoff
router.put('/:id/delivery', authenticate, userOrderController.updateDelivery);

//step 5 : finalize order
router.post('/:id/finalize', authenticate, userOrderController.finalizeOrder);

//step 5: review order
router.get('/:id/review', authenticate, userOrderController.reviewOrder);

export default router;