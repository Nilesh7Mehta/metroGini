import express from 'express';
import * as userOrderController from '../../controller/users/userOrder.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { isUser } from '../../middleware/checkRole.middleware.js';

const router = express.Router();

// Apply authentication + role check to all routes below
router.use(authenticate);
router.use(isUser);



//create draft order
router.post('/', userOrderController.createDraftOrder);

//Step 2: Update service type for the draft order
router.put('/:id/service-type', userOrderController.updateServiceType);

//step 3: update pickup 
router.put('/:id/pickup', userOrderController.updatePickup);

//step 4: update dropoff
router.put('/:id/delivery', userOrderController.updateDelivery);

// save special instructions for pickup / drop
router.put('/:id/instructions', userOrderController.updateOrderInstructions);

//step 5 : finalize order
router.post('/:id/finalize', userOrderController.finalizeOrder);

// Combined step: service type + pickup + auto delivery (+3 days) + finalize
router.post('/:id/complete-order', userOrderController.completeOrderSetup);

//step 5: review order
router.get('/:id/review', userOrderController.reviewOrder);

//step Apply Coupon
router.post('/:id/applyCoupon', userOrderController.applyCoupon);

router.post('/:id/removeCoupon', userOrderController.removeCoupon);

router.get('/getUserOrder' , userOrderController.getUserOrder);
router.get('/:id/Orderdetail', userOrderController.getUserOrderDetail);

// Reschedule Order - (Pickup can change before 12 hrs of actual Pickup)
router.put('/:id/rescheduleOrderPickup' , userOrderController.rescheduleOrderPickup);

router.put('/:id/rescheduleOrderDelivery' , userOrderController.rescheduleOrderDelivery)

router.post('/:id/cancelService' , userOrderController.cancelService);

//report oder
router.post('/report-order' , userOrderController.reportOrderIssue);


export default router;