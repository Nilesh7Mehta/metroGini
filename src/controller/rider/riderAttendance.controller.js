import {
  checkInService,
  checkOutService,
  getTodayAttendanceService,
  getAttendanceHistoryService,
} from "../../services/rider/riderAttendance.service.js";

const sendError = (res, next, error) => {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return next(error);
};

export const checkIn = async (req, res, next) => {
  try {
    const { already_checked_in, session } = await checkInService(req.user.rider_id);
    return res.status(200).json({
      success: true,
      message: already_checked_in ? "You are already checked in" : "Checked in successfully",
      data: { already_checked_in, session },
    });
  } catch (error) {
    return sendError(res, next, error);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const session = await checkOutService(req.user.rider_id);
    return res.status(200).json({
      success: true,
      message: "Checked out successfully",
      data: { session },
    });
  } catch (error) {
    return sendError(res, next, error);
  }
};

export const getToday = async (req, res, next) => {
  try {
    const data = await getTodayAttendanceService(req.user.rider_id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, next, error);
  }
};

export const getHistory = async (req, res, next) => {
  try {
    const data = await getAttendanceHistoryService(req.user.rider_id, req.query.month);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, next, error);
  }
};
