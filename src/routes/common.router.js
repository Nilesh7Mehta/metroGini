import express from 'express';
import * as CommonController from '../controller/Common.controller.js';
const router = express.Router();

router.get('/cities', CommonController.getCities);
router.get('/services', CommonController.getServices);
router.get('/service-types', CommonController.getServiceTypes);
router.get('/time-slots', CommonController.getTimeSlots);


router.get('/userfaq',  CommonController.userFaq);
router.get('/shift',  CommonController.shift);




export default router;