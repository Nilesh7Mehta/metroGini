import express from 'express';
import * as adminController from '../../controller/admin/admin.controller.js';

const router = express.Router();
router.post('/login', adminController.loginAdmin);

export default router;