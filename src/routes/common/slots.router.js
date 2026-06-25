import express from 'express';
import * as slotsAvailabilityController from '../../controller/common/slotsAvailability.controller.js';

const router = express.Router();

router.get('/availability', slotsAvailabilityController.getAvailability);
router.get('/delivery-dates', slotsAvailabilityController.getDeliveryDate);

export default router;
