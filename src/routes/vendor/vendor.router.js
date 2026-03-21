import express from "express";  
import * as vendorController from '../../controller/vendor/vendor.controller.js'
import { authenticate } from "../../middleware/auth.middleware.js";
import { sendOtpLimiter, verifyOtpLimiter } from "../../middleware/rateLimiter.js";
const router=express.Router()

//login Or Verify
router.post('/loginOrVerify' , sendOtpLimiter, vendorController.loginVerify);
router.post('/verifyOtp' , verifyOtpLimiter, vendorController.verifyOtp);

//goActive 
router.post('/goActive' , authenticate , vendorController.goActive);
router.post('/acceptTerms' , authenticate , vendorController.acceptTerms);



export default router;