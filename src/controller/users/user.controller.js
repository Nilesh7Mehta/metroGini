import * as userAuthService from "../../services/users/userAuth.service.js";
import * as userProfileService from "../../services/users/userProfile.service.js";
import * as userAddressService from "../../services/users/userAddress.service.js";
import * as userSettingsService from "../../services/users/userSettings.service.js";

//check if user exists by mobile
export const loginOrRegister = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAuthService.loginOrRegister({
      mobile: req.body.mobile,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};

export const verifyOTP = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAuthService.verifyOTP({
      mobile: req.body.mobile,
      otp: req.body.otp,
    });

    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};

//refresh token endpoint 
export const refreshAccessToken = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAuthService.refreshAccessToken({
      refresh_token: req.body.refresh_token,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};


// GET USER PROFILE
export const getProfile = async (req, res, next) => {
  try {
    const { statusCode, body } = await userProfileService.getProfile({
      req,
      userId: req.user.id,
    });
    return res.status(statusCode).json(body);

  } catch (error) {
    next(error);
  }
};



//update user profile
export const updateProfile = async (req, res, next) => {
  try {
    const { statusCode, body } = await userProfileService.updateProfile({
      userId: req.user.id,
      body: req.body,
      file: req.file,
    });

    return res.status(statusCode).json(body);

  } catch (error) {
    next(error);
  }
};

//get Address
export const getAddress = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAddressService.getAddress({
      userId: req.user.id,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};

//Add Address
export const addAddress = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAddressService.addAddress({
      userId: req.user.id,
      body: req.body,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};

//Update Address
export const updateAddress = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAddressService.updateAddress({
      userId: req.user.id,
      addressId: req.params.id,
      body: req.body,
    });

    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
}

//Delete Address
export const deleteAddress = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAddressService.deleteAddress({
      userId: req.user.id,
      addressId: req.params.id,
    });

    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
}

//Set Default Address
export const setDefaultAddress = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAddressService.setDefaultAddress({
      userId: req.user.id,
      addressId: req.params.id,
    });

    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
}

//Terms and Condition
export const acceptTerms = async(req , res , next)=>{
  try {
    const { statusCode, body } = await userSettingsService.acceptTerms({
      userId: req.user.id,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
}

//need help 
export const needHelp = async (req , res , next) => {
  try{
    const { statusCode, body } = await userSettingsService.needHelp({
      userId: req.user.id,
      message: req.body.message,
    });

    return res.status(statusCode).json(body);
  }catch(error){
    next(error); 
  }
}

//push_notification
export const allowNotification = async (req, res, next) => {
  try {
    const { statusCode, body } = await userSettingsService.allowNotification({
      userId: req.user.id,
      is_notification_allowed: req.body.is_notification_allowed,
    });

    return res.status(statusCode).json(body);

  } catch (error) {
    next(error);
  }
};

//logout
export const logout = async (req, res, next) => {
  try {
    const { statusCode, body } = await userAuthService.logout({
      refresh_token: req.body.refresh_token,
    });
    return res.status(statusCode).json(body);
  } catch (error) {
    next(error);
  }
};
