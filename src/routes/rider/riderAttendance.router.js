import express from "express";
import * as riderAttendanceController from "../../controller/rider/riderAttendance.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { isRider } from "../../middleware/checkRole.middleware.js";

const router = express.Router();

router.use(authenticate, isRider);

router.post("/check-in", riderAttendanceController.checkIn);
router.post("/check-out", riderAttendanceController.checkOut);
router.get("/today", riderAttendanceController.getToday);
router.get("/history", riderAttendanceController.getHistory);

export default router;
