import {
  registerDeviceToken,
  removeDeviceToken,
} from "../common/push.service.js";

export const registerFcmToken = async ({ userId, fcmToken, platform }) => {
  await registerDeviceToken({ userId, fcmToken, platform });

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "FCM token registered successfully",
    },
  };
};

export const unregisterFcmToken = async ({ userId, fcmToken }) => {
  await removeDeviceToken(userId, fcmToken);

  return {
    statusCode: 200,
    body: {
      success: true,
      message: "FCM token removed successfully",
    },
  };
};
