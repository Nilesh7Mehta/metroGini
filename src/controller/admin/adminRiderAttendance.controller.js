import {
  getRiderAttendanceByDate,
  getRiderAttendanceHistory,
} from "../../services/admin/adminRiderAttendance.service.js";

const sendError = (res, next, error) => {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  return next(error);
};

// GET /api/admin/rider-attendance?date=YYYY-MM-DD&search=
export const getAttendanceByDate = async (req, res, next) => {
  try {
    const data = await getRiderAttendanceByDate({
      date: req.query.date,
      search: req.query.search,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, next, error);
  }
};

// GET /api/admin/rider-attendance/riders/:id?from=YYYY-MM-DD&to=YYYY-MM-DD
export const getAttendanceHistory = async (req, res, next) => {
  try {
    const data = await getRiderAttendanceHistory(req.params.id, {
      from: req.query.from,
      to: req.query.to,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, next, error);
  }
};
