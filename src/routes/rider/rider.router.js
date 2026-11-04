import express from "express";
import * as riderController from '../../controller/rider/rider.controller.js';
import * as helplineController from '../../controller/helpline.controller.js';
import {sendOtpLimiter , verifyOtpLimiter}  from '../../middleware/rateLimiter.js';
import { createUploader } from "../../middleware/upload.js";
import {authenticate} from '../../middleware/auth.middleware.js'
import { isRider } from '../../middleware/checkRole.middleware.js';
const router = express.Router();
const riderUpload = createUploader("riders", 10 * 1024 * 1024);

const handleRiderImageUpload = (req, res, next) => {
  riderUpload.single("image")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Image must be 10MB or smaller",
      });
    }
    if (err) return next(err);
    next();
  });
};

router.post('/login-or-register' , sendOtpLimiter, riderController.loginOrVerify);
router.post('/verifyOtp' , verifyOtpLimiter , riderController.verifyOtp);

router.post('/chooseShift' , authenticate, isRider, riderController.chooseShift);
router.post('/goActive' , authenticate, isRider, riderController.goActive);
router.post('/terms-and-conditions' , authenticate , isRider, riderController.acceptTerms);
router.post('/updateProfile' , authenticate , isRider, handleRiderImageUpload, riderController.updateProfile);
router.get('/getProfile' , authenticate , isRider, riderController.getProfile);
router.get('/todayShifts' , authenticate , isRider, riderController.getTodayShifts);
router.get('/roster' , authenticate , isRider, riderController.getRoster);

router.post('/needRiderHelp' ,authenticate , isRider, helplineController.needHelpAsRider);

// Logout = check out of attendance (if checked in); app then deletes its token
router.post('/logout', authenticate, isRider, riderController.logout);

export default router;
