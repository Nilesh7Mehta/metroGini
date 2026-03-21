import express from 'express';
import * as adminController from '../../controller/admin/admin.controller.js';
import * as bannerController from '../../controller/admin/banner.controller.js';
import * as adminvendorController from '../../controller/admin/adminVendor.controller.js';
import { createUploader } from "../../middleware/upload.js";
import { authenticate } from '../../middleware/auth.middleware.js';
const bannerUpload = createUploader("banners", 500 * 1024);
const vendorUpload = createUploader("vendors", 2 * 1024 * 1024);

const router = express.Router();
router.post('/login', adminController.loginAdmin);
router.post('/createCoupon',  authenticate,  adminController.createCoupon);
router.put('/updateCoupon/:id', authenticate,  adminController.updateCoupon);
// router.delete('/deleteCoupon/:id', adminController.deleteCoupon);
router.get('/getCoupon', authenticate,  adminController.getCoupons);
router.get('/getCoupon/:id' , authenticate,  adminController.getCouponById);

//Banners;
router.post("/addBanner", authenticate, bannerUpload.single("image"), bannerController.addBanner);
router.put("/updateBanner/:id",  authenticate,  bannerUpload.single("image"), bannerController.updateBanner);
router.delete("/deleteBanner/:id",  authenticate, bannerController.deleteBanner);


// Vendor
router.post('/addVendor', authenticate, vendorUpload.single('image'), adminvendorController.addVendor);

export default router;