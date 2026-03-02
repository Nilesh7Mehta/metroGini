import express from 'express';
import * as userDashboardController from '../controller/Common.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';


const router = express.Router();

router.get('/cities', authenticate, userDashboardController.getCities);
router.get('/services', authenticate, userDashboardController.getServices);
router.get('/service-types', authenticate, userDashboardController.getServiceTypes);
router.get('/time-slots', authenticate, userDashboardController.getTimeSlots);


router.get('/faq', authenticate)



export default router;