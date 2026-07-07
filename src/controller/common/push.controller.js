import {
  sendTestPush,
  verifyFirebaseConnection,
} from "../../services/common/push.service.js";
import { isFirebaseEnabled } from "../../config/firebase.js";

export const getPushStatus = async (req, res, next) => {
  try {
    const configured = isFirebaseEnabled();

    if (!configured) {
      return res.status(200).json({
        success: true,
        message: "Firebase is not configured",
        data: { configured: false, connected: false },
      });
    }

    await verifyFirebaseConnection();

    return res.status(200).json({
      success: true,
      message: "Firebase connection verified",
      data: { configured: true, connected: true },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        data: { configured: isFirebaseEnabled(), connected: false },
      });
    }

    next(error);
  }
};

export const sendTestPushHandler = async (req, res, next) => {
  try {
    const { title, body } = req.body;

    const result = await sendTestPush(req.user.id, { title, body });

    return res.status(200).json({
      success: true,
      message: "Test push sent successfully",
      data: result,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }

    next(error);
  }
};
