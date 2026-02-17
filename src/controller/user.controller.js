import { createNewUser, getAllUsers, getUserById } from "../models/user.model.js";

export const fetchAllUsers = async (req, res, next) => {
  try {
    const users = await getAllUsers();

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

export const fetchUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: user,
    });
  }
    catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    // console.log(name, email);

    if (!name && !email) {
      return res.status(400).json({
        success: false,
        message: "Name and Email are required",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const userData = { name, email };
    // console.log(userData);

    const newUser = await createNewUser(userData);

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: newUser,
    });

  } catch (error) {
    next(error);
  }
};


