import express from 'express';
import * as userController from '../controller/user.controller.js';

const router = express.Router();

// GET all users
router.get('/', userController.fetchAllUsers);
//Get user by id
router.get('/:id', userController.fetchUserById);
// Create a new user
router.post('/create', userController.createUser);

// console.log('User router loaded' , userController);



export default router;
