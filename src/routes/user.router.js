import express from 'express';
import * as userController from '../controller/user.controller.js';

const router = express.Router();

router.post('/', userController.loginOrRegister);

// console.log('User router loaded' , userController);



export default router;
