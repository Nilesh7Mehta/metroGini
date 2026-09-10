import express from "express";
import * as riderController from '../../controller/rider/rider.controller.js';
import * as helplineController from '../../controller/helpline.controller.js';
import {sendOtpLimiter , verifyOtpLimiter}  from '../../middleware/rateLimiter.js';
import { createUploader } from "../../middleware/upload.js";
import {authenticate} from '../../middleware/auth.middleware.js'
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

router.post('/chooseShift' , authenticate, riderController.chooseShift);
router.post('/goActive' , authenticate, riderController.goActive);
router.post('/terms-and-conditions' , authenticate , riderController.acceptTerms);
router.post('/updateProfile' , authenticate , handleRiderImageUpload, riderController.updateProfile);
router.get('/getProfile' , authenticate , riderController.getProfile);
router.get('/roster' , authenticate , riderController.getRoster);

router.post('/needRiderHelp' ,authenticate ,  helplineController.needHelpAsRider);

export default router;
