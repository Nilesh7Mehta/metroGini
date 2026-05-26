import express from "express";  
import * as vendorController from '../../controller/vendor/vendor.controller.js'
import * as helplineController from '../../controller/helpline.controller.js'
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  sendOtpLimiter,
  verifyOtpLimiter,
  vendorAuthLimiter,
} from "../../middleware/rateLimiter.js";
const router=express.Router()

// Email + password auth
router.post("/register", vendorAuthLimiter, vendorController.register);
router.post("/login", vendorAuthLimiter, vendorController.login);

// Legacy OTP login
router.post('/loginOrVerify' , sendOtpLimiter, vendorController.loginVerify);
router.post('/verifyOtp' , verifyOtpLimiter, vendorController.verifyOtp);

//goActive 
router.post('/goActive' , authenticate , vendorController.goActive);
router.post('/acceptTerms' , authenticate , vendorController.acceptTerms);

// Profile
router.get('/profile', authenticate, vendorController.getProfile);
router.put('/profile', authenticate, vendorController.updateProfile);

router.post('/needHelp', authenticate, helplineController.needHelpAsVendor);



export default router;