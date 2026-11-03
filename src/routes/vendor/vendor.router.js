import express from "express";  
import * as vendorController from '../../controller/vendor/vendor.controller.js'
import * as vendorPayoutController from '../../controller/vendor/vendorPayout.controller.js'
import * as helplineController from '../../controller/helpline.controller.js'
import { authenticate } from "../../middleware/auth.middleware.js";
import { isVendor } from "../../middleware/checkRole.middleware.js";
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
router.post('/goActive' , authenticate , isVendor, vendorController.goActive);
router.post('/acceptTerms' , authenticate , isVendor, vendorController.acceptTerms);

// Home dashboard
router.get('/dashboard', authenticate, isVendor, vendorController.getDashboard);

// Profile
router.get('/profile', authenticate, isVendor, vendorController.getProfile);
router.put('/profile', authenticate, isVendor, vendorController.updateProfile);

// Payout (self — pending + paid batches)
router.get('/payout', authenticate, isVendor, vendorPayoutController.getMyPayout);

router.post('/needHelp', authenticate, isVendor, helplineController.needHelpAsVendor);



export default router;