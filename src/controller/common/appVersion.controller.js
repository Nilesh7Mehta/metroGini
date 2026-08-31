import * as appVersionService from "../../services/common/appVersion.service.js";

export const getAppVersions = async (req, res, next) => {
  try {
    const data = await appVersionService.getAppVersions(req.query.app_for);
    return res.status(200).json({
      success: true,
      message: "App version info fetched",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAppVersionInfo = async (req, res, next) => {
  try {
    const { app_for, type, version, app_url, status } = req.body;

    if (!appVersionService.ALLOWED_APP_FOR.includes(app_for)) {
      return res.status(400).json({
        success: false,
        message: "Invalid app_for. Allowed values: user, rider",
      });
    }

    if (!appVersionService.ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Allowed values: android, ios",
      });
    }

    const fields = { version, app_url, status };
    const hasUpdatable = appVersionService.UPDATABLE_FIELDS.some(
      (key) => fields[key] !== undefined,
    );

    if (!hasUpdatable) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields provided. Allowed: version, app_url, status",
      });
    }

    const updated = await appVersionService.updateAppVersionInfo(app_for, type, fields);

    return res.status(200).json({
      success: true,
      message: "App version updated",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
