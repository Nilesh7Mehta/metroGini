/**
 * Auth for Gallabox → MetroGini WhatsApp APIs.
 * Header: X-Gallabox-Secret: <WHATSAPP_API_SECRET>
 * Or: Authorization: Bearer <WHATSAPP_API_SECRET>
 */
export const requireWhatsappSecret = (req, res, next) => {
  const expected = String(process.env.WHATSAPP_API_SECRET || "").trim();
  if (!expected) {
    return res.status(503).json({
      success: false,
      message:
        "WhatsApp API not configured. Set WHATSAPP_API_SECRET in environment.",
    });
  }

  const headerSecret = String(req.headers["x-gallabox-secret"] || "").trim();
  const auth = String(req.headers.authorization || "");
  const bearer =
    auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const provided = headerSecret || bearer;
  if (!provided || provided !== expected) {
    return res.status(401).json({
      success: false,
      message: "Invalid or missing WhatsApp API secret",
    });
  }

  next();
};
