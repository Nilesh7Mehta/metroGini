import express from 'express';
import * as userController from '../controller/user.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { createUploader } from "../middleware/upload.js";
const profileUpload = createUploader("profile", 500 * 1024); 
const router = express.Router();

router.post('/login-or-register', userController.loginOrRegister);
router.post('/verify-otp', userController.verifyOTP);

router.post('/refresh-token', userController.refreshAccessToken);
router.post('/logout', userController.logout);

router.get('/profile', authenticate, userController.getProfile);
router.put("/profile",authenticate, profileUpload.single("profile_image"), userController.updateProfile);

router.get('/address', authenticate, userController.getAddress);
router.post('/address', authenticate, userController.addAddress);
router.put('/address/:id', authenticate, userController.updateAddress);
router.delete('/address/:id', authenticate, userController.deleteAddress);
router.put('/address/default/:id', authenticate, userController.setDefaultAddress);

// console.log('User router loaded' , userController);

//terms and conditions
router.put('/terms-and-conditions', authenticate, userController.acceptTerms);




export default router;
