import express from 'express';
import * as CommonController from '../controller/Common.controller.js';
import * as helplineController from '../controller/helpline.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/cities', CommonController.getCities);
router.get('/services', CommonController.getServices);
router.get('/service-types', CommonController.getServiceTypes);
router.get('/time-slots', CommonController.getTimeSlots);


router.get('/userfaq',  CommonController.userFaq);
router.get('/shift',  CommonController.shift);
router.get('/banners',  CommonController.getBanners);

// Unified need help — body: { type: "user"|"rider"|"vendor", message, report_issue? }
router.post('/needHelp', authenticate, helplineController.needHelp);





export default router;