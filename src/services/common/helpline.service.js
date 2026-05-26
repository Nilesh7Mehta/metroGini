import sql from "../../config/db.js";

const HELPLINE_TYPES = ["user", "rider", "vendor"];

export const resolveHelplineIdentity = (req, type) => {
  const normalized = String(type || "").toLowerCase();

  if (!HELPLINE_TYPES.includes(normalized)) {
    throw {
      status: 400,
      message: `type must be one of: ${HELPLINE_TYPES.join(", ")}`,
    };
  }

  if (normalized === "user") {
    if (req.user?.role !== "user" || !req.user?.id) {
      throw { status: 403, message: "Invalid token for type user" };
    }
    return { type: "user", identityId: req.user.id };
  }

  if (normalized === "rider") {
    if (!req.user?.rider_id) {
      throw { status: 403, message: "Invalid token for type rider" };
    }
    return { type: "rider", identityId: req.user.rider_id };
  }

  if (!req.user?.vendor_id) {
    throw { status: 403, message: "Invalid token for type vendor" };
  }
  return { type: "vendor", identityId: req.user.vendor_id };
};

export const submitNeedHelp = async ({
  type,
  identityId,
  message,
  report_issue,
}) => {
  if (!message?.trim()) {
    throw { status: 400, message: "Message field is required" };
  }

  if (type === "rider" && !report_issue?.trim()) {
    throw { status: 400, message: "Report issue is required for type rider" };
  }

  const { rows } = await sql.query(
    `INSERT INTO support_requests (type, identity_id, report_issue, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, type, identity_id, report_issue, message, status, created_at, updated_at`,
    [type, identityId, report_issue?.trim() || null, message.trim()],
  );

  return rows[0];
};

export const submitNeedHelpFromRequest = async (req, body) => {
  const { type, message, report_issue } = body;
  const resolved = resolveHelplineIdentity(req, type);
  return submitNeedHelp({
    type: resolved.type,
    identityId: resolved.identityId,
    message,
    report_issue,
  });
};
