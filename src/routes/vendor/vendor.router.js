import express from "express";  
import * as vendorController from '../../controller/vendor/vendor.controller.js'
import { authenticate } from "../../middleware/auth.middleware.js";
const router=express.Router()

//login Or Verify
router.post('/loginOrVerify' , vendorController.loginVerify);