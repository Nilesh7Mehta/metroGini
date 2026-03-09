import express from "express";
import * as riderController from '../../controller/rider/rider.controller.js';
import {sendOtpLimiter , verifyOtpLimiter}  from '../../middleware/rateLimiter.js';
import {authenticate} from '../../middleware/auth.middleware.js'
const router = express.Router();


router.post('/login-or-register' , sendOtpLimiter, riderController.loginOrVerify);
router.post('/verifyOtp' , verifyOtpLimiter , riderController.verifyOtp);

router.post('/chooseShift' , authenticate, riderController.chooseShift);
router.post('/goActive' , authenticate, riderController.goActive);
router.put('/terms-and-conditions' , authenticate , riderController.acceptTerms);


export default router;
