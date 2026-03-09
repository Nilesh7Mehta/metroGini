import express from "express";
import * as riderController from '../../controller/rider/rider.controller.js';
import {sendOtpLimiter , verifyOtpLimiter}  from '../../middleware/rateLimiter.js';
const router = express.Router();


router.post('/login-or-register' , sendOtpLimiter, riderController.loginOrVerify);
router.post('/verifyOtp' , verifyOtpLimiter , riderController.verifyOtp);


export default router;
