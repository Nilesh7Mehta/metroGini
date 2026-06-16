import express from 'express';
import * as adminController from '../../controller/admin/admin.controller.js';
import * as bannerController from '../../controller/admin/banner.controller.js';
import * as adminvendorController from '../../controller/admin/adminVendor.controller.js';
import * as adminDashboardController from '../../controller/admin/adminDashboard.controller.js';
import * as adminOrderController from '../../controller/admin/adminOrder.controller.js';
import * as adminMerchantController from '../../controller/admin/adminMerchant.controller.js';
import * as adminRiderController from '../../controller/admin/adminRider.controller.js';
import * as adminPaymentController from '../../controller/admin/adminPayment.controller.js';
import * as adminIssueController from '../../controller/admin/adminIssue.controller.js';
import * as adminHelpSupportController from '../../controller/admin/adminHelpSupport.controller.js';
import * as adminMarketingController from '../../controller/admin/adminMarketing.controller.js';
import * as adminCityController from '../../controller/admin/adminCity.controller.js';
import * as adminServiceController from '../../controller/admin/adminService.controller.js';
import * as adminServiceTypeController from '../../controller/admin/adminServiceType.controller.js';
import { createUploader } from "../../middleware/upload.js";
import { authenticate } from '../../middleware/auth.middleware.js';
const bannerUpload = createUploader("banners", 500 * 1024);
const vendorUpload = createUploader("vendors", 2 * 1024 * 1024);
const cityUpload = createUploader("cities", 500 * 1024);
const serviceUpload = createUploader("services", 500 * 1024);

const router = express.Router();
router.post('/login', adminController.loginAdmin);
router.get('/dashboard', authenticate, adminDashboardController.getAdminDashboard);
router.get('/payments', authenticate, adminPaymentController.getAdminPayments);
router.get('/issues', authenticate, adminIssueController.getAdminIssues);
router.get('/help-support', authenticate, adminHelpSupportController.getAdminHelpSupport);
router.get('/marketing', authenticate, adminMarketingController.getAdminMarketing);
router.post('/addCity', authenticate, cityUpload.single('image'), adminCityController.addCity);
router.post('/updateCity/:id', authenticate, cityUpload.single('image'), adminCityController.updateCityById);
router.post('/addService', authenticate, serviceUpload.single('image'), adminServiceController.addService);
router.put('/updateService/:id', authenticate, serviceUpload.single('image'), adminServiceController.updateServiceById);
router.post('/addServiceType', authenticate, adminServiceTypeController.addServiceType);
router.put('/updateServiceType/:id', authenticate, adminServiceTypeController.updateServiceTypeById);
router.get('/orders', authenticate, adminOrderController.getAdminOrders);
router.get('/orders/:id', authenticate, adminOrderController.getAdminOrderDetails);
router.get('/order/:id/operations', authenticate, adminOrderController.getAdminOrderOperations);
router.post('/merchants', authenticate, adminMerchantController.createAdminMerchant);
router.get('/merchants', authenticate, adminMerchantController.getAdminMerchants);
router.get('/merchants/:id/orders', authenticate, adminMerchantController.getAdminMerchantOrders);
router.put('/merchants/:id', authenticate, adminMerchantController.updateAdminMerchant);
router.get('/merchants/:id', authenticate, adminMerchantController.getAdminMerchantDetails);
router.get('/riders', authenticate, adminRiderController.getAdminRiders);
router.post('/riders', authenticate, adminRiderController.createAdminRider);
router.get('/riders/:id/orders', authenticate, adminRiderController.getAdminRiderOrders);
router.get('/riders/:id', authenticate, adminRiderController.getAdminRiderDetails);
router.put('/riders/:id', authenticate, adminRiderController.updateAdminRider);
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
router.put('/updateVendor/:id', authenticate, vendorUpload.single('image'), adminvendorController.updateVendor);

export default router;