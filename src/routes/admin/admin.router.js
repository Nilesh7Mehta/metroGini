import express from 'express';
import * as adminController from '../../controller/admin/admin.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();
router.post('/login', adminController.loginAdmin);
router.post('/createCoupon',  authenticate,  adminController.createCoupon);
router.put('/updateCoupon/:id', authenticate,  adminController.updateCoupon);
// router.delete('/deleteCoupon/:id', adminController.deleteCoupon);
router.get('/getCoupon', authenticate,  adminController.getCoupons);
router.get('/getCoupon/:id' , authenticate,  adminController.getCouponById);

export default router;