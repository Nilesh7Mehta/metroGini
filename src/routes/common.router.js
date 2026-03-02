import express from 'express';
import * as CommonController from '../controller/Common.controller.js';
const router = express.Router();

router.get('/cities', CommonController.getCities);
router.get('/services', CommonController.getServices);
router.get('/service-types', CommonController.getServiceTypes);
router.get('/time-slots', CommonController.getTimeSlots);


router.get('/faq',  CommonController.faq);



export default router;