import express from 'express';
import * as CommonController from '../controller/Common.controller.js';
import * as helplineController from '../controller/helpline.controller.js';
import * as pincodeGroupController from '../controller/common/pincodeGroup.controller.js';
import * as pincodeController from '../controller/common/pincode.controller.js';
import * as partnerLeadController from '../controller/common/partnerLead.controller.js';
import slotsRouter from './common/slots.router.js';
import * as configController from '../controller/common/config.controller.js';
import * as emailController from '../controller/common/email.controller.js';
import * as pushController from '../controller/common/push.controller.js';
import * as appVersionController from '../controller/common/appVersion.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { isAdmin, isUser } from '../middleware/checkRole.middleware.js';

const router = express.Router();

router.get('/cities', CommonController.getCities);
router.get('/services', CommonController.getServices);
router.get('/service-types', CommonController.getServiceTypes);
router.get('/time-slots', CommonController.getTimeSlots);
router.get('/config', configController.getConfig);
router.get('/app-versions', appVersionController.getAppVersions);

// SMTP
router.get('/email/status', emailController.getEmailStatus);
router.post('/email/test', authenticate, isAdmin, emailController.sendTestEmailHandler);
router.get('/email/test-invoice', emailController.sendTestInvoiceEmailHandler);
router.post('/email/test-invoice', emailController.sendTestInvoiceEmailHandler);

// Firebase push
router.get('/push/status', pushController.getPushStatus);
router.post('/push/test', authenticate, isUser, pushController.sendTestPushHandler);


router.get('/faq', CommonController.getFaqs);
router.get('/userfaq', CommonController.getFaqs);
router.get('/shift',  CommonController.shift);
router.get('/banners',  CommonController.getBanners);
router.get('/know-about-us', CommonController.getKnowAboutUs);
router.get('/how-we-work', CommonController.getHowWeWork);

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

router.use('/slots', slotsRouter);

// Unified need help — body: { type: "user"|"rider"|"vendor", message, report_issue? }
router.post('/needHelp', authenticate, helplineController.needHelp);

// Partner lead — body: { name, email, phone }
router.post('/partnerLead', partnerLeadController.submitPartnerLead);

export default router;