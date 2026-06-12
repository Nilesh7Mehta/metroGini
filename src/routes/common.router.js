import express from 'express';
import * as CommonController from '../controller/Common.controller.js';
import * as helplineController from '../controller/helpline.controller.js';
import * as pincodeGroupController from '../controller/common/pincodeGroup.controller.js';
import * as pincodeController from '../controller/common/pincode.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { isAdmin } from '../middleware/checkRole.middleware.js';

const router = express.Router();

router.get('/cities', CommonController.getCities);
router.get('/services', CommonController.getServices);
router.get('/service-types', CommonController.getServiceTypes);
router.get('/time-slots', CommonController.getTimeSlots);


router.get('/userfaq',  CommonController.userFaq);
router.get('/shift',  CommonController.shift);
router.get('/banners',  CommonController.getBanners);

// Pincode groups
router.get('/pincode-groups', pincodeGroupController.listPincodeGroups);
router.get('/pincode-groups/:id', pincodeGroupController.getPincodeGroup);
router.post('/pincode-groups', authenticate, isAdmin, pincodeGroupController.addPincodeGroup);
router.put('/pincode-groups/:id', authenticate, isAdmin, pincodeGroupController.editPincodeGroup);
router.delete('/pincode-groups/:id', authenticate, isAdmin, pincodeGroupController.removePincodeGroup);

// Pincodes
router.get('/pincodes', pincodeController.listPincodes);
router.get('/pincodes/:id', pincodeController.getPincode);
router.post('/pincodes', authenticate, isAdmin, pincodeController.addPincode);
router.put('/pincodes/:id', authenticate, isAdmin, pincodeController.editPincode);
router.delete('/pincodes/:id', authenticate, isAdmin, pincodeController.removePincode);

// Unified need help — body: { type: "user"|"rider"|"vendor", message, report_issue? }
router.post('/needHelp', authenticate, helplineController.needHelp);





export default router;