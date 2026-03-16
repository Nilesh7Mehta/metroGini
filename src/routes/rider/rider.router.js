import express from "express";
import * as riderController from '../../controller/rider/rider.controller.js';
import {sendOtpLimiter , verifyOtpLimiter}  from '../../middleware/rateLimiter.js';
import { createUploader } from "../../middleware/upload.js";
import {authenticate} from '../../middleware/auth.middleware.js'
const router = express.Router();
const riderUpload = createUploader("riders");

router.post('/login-or-register' , sendOtpLimiter, riderController.loginOrVerify);
router.post('/verifyOtp' , verifyOtpLimiter , riderController.verifyOtp);

router.post('/chooseShift' , authenticate, riderController.chooseShift);
router.post('/goActive' , authenticate, riderController.goActive);
router.post('/terms-and-conditions' , authenticate , riderController.acceptTerms);
router.post('/updateProfile' , authenticate , riderUpload.single("image"), riderController.updateProfile);
router.get('/getProfile' , authenticate , riderController.getProfile);

router.post('/needRiderHelp' ,authenticate ,  riderController.needHelp);

export default router;
