import express from "express";
import { requireWhatsappSecret } from "../middleware/whatsappAuth.middleware.js";
import * as whatsappController from "../controller/whatsapp/whatsapp.controller.js";

const router = express.Router();

router.use(requireWhatsappSecret);

/** No-OTP session: WhatsApp mobile → JWT + profile */
router.post("/session", whatsappController.createSession);

/** Soft identity check (no token) */
router.post("/customer/lookup", whatsappController.lookupCustomer);
router.get("/customer/lookup", whatsappController.lookupCustomer);

/** CRM segments for push scenarios */
router.get("/crm/inactive-app-users", whatsappController.inactiveAppUsers);
router.get("/crm/winback", whatsappController.winbackUsers);
router.get(
  "/customer/:mobile/abandoned-booking",
  whatsappController.abandonedBooking,
);
router.get("/customer/abandoned-booking", whatsappController.abandonedBooking);

/** Order helpers for WhatsApp */
router.get("/orders/active-by-mobile", whatsappController.activeOrderByMobile);
router.get("/orders/:id/rider", whatsappController.orderRider);
router.get("/orders/:id/delay-status", whatsappController.delayStatus);

/** Test / manual outbound event to Gallabox */
router.post("/events/emit", whatsappController.emitEvent);

export default router;
