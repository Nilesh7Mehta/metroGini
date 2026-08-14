import sql from "../../config/db.js";
import {
  getSpringEdgeApiKey,
  getSpringEdgeApiUrl,
  getSpringEdgeSender,
  isSmsEnabled,
} from "../../config/sms.js";
import { buildSmsMessage } from "../../utils/smsTemplates.js";

/** Normalize to SpringEdge-style Indian MSISDN: 91XXXXXXXXXX */
export const normalizeMobile = (mobile) => {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  return digits;
};

const MESSAGE_ID_KEYS = new Set([
  "messageid",
  "messageids",
  "message_id",
  "message_ids",
  "msgid",
  "msgids",
  "msg_id",
  "groupid",
  "group_id",
  "transactionid",
  "transaction_id",
  "jobid",
  "job_id",
  "campaignid",
  "campaign_id",
]);

const extractMessageId = (payload, depth = 0) => {
  if (payload == null || depth > 6) return null;

  if (typeof payload === "string" || typeof payload === "number") {
    const s = String(payload).trim();
    // SpringEdge sometimes returns a bare job/message id string
    if (s && !/^(ok|success|true|false|error|fail|failed|awaited-dlr)$/i.test(s)) {
      return s;
    }
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractMessageId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload !== "object") return null;

  // Prefer MessageIDs / MessageID over groupID
  const preferredKeys = [
    "MessageIDs",
    "MessageID",
    "messageids",
    "messageid",
    "message_ids",
    "message_id",
    "msgid",
    "groupID",
    "groupId",
    "groupid",
  ];
  for (const key of preferredKeys) {
    if (payload[key] == null || typeof payload[key] === "object") continue;
    const id = String(payload[key]).trim();
    if (id) return id;
  }

  // Prefer known SpringEdge keys (case-insensitive)
  for (const [key, value] of Object.entries(payload)) {
    const normalized = String(key).toLowerCase().replace(/[\s-]/g, "");
    if (!MESSAGE_ID_KEYS.has(normalized)) continue;
    if (value == null || typeof value === "object") continue;
    const id = String(value).trim();
    if (id) return id;
  }

  // Nested containers commonly used by SpringEdge
  for (const nestKey of [
    "data",
    "Data",
    "result",
    "Result",
    "groupstatus",
    "GroupStatus",
    "response",
  ]) {
    if (payload[nestKey] != null) {
      const found = extractMessageId(payload[nestKey], depth + 1);
      if (found) return found;
    }
  }

  // Last resort: shallow scan other nested objects/arrays
  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const found = extractMessageId(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
};

const mapProviderError = (httpStatus, bodyText, parsed) => {
  const blob = `${bodyText || ""} ${JSON.stringify(parsed || {})}`.toLowerCase();

  if (/invalid.?api.?key|apikey|unauthorized|authentication/.test(blob) || httpStatus === 401) {
    return { code: "invalid_api_key", message: "Invalid SpringEdge API key" };
  }
  if (/invalid.?sender|sender.?id|senderid/.test(blob)) {
    return { code: "invalid_sender", message: "Invalid SpringEdge sender ID" };
  }
  if (/invalid.?mobile|invalid.?number|to.?number|recipient/.test(blob)) {
    return { code: "invalid_mobile", message: "Invalid mobile number" };
  }
  if (/credit|balance|insufficient/.test(blob)) {
    return {
      code: "insufficient_credits",
      message: "Insufficient SpringEdge credits",
    };
  }
  return {
    code: "provider_error",
    message:
      parsed?.message ||
      parsed?.error ||
      parsed?.status ||
      bodyText ||
      `SpringEdge request failed (HTTP ${httpStatus || "unknown"})`,
  };
};

const isProviderSuccess = (httpStatus, parsed) => {
  if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) return false;
  if (parsed == null) return httpStatus >= 200 && httpStatus < 300;

  if (typeof parsed === "string") {
    const s = parsed.toLowerCase();
    if (s.includes("error") || s.includes("fail")) return false;
    return true;
  }

  if (typeof parsed !== "object") return true;

  const status = String(
    parsed.status ?? parsed.Status ?? parsed.result ?? "",
  ).toLowerCase();
  if (["error", "failed", "fail", "false", "0"].includes(status)) return false;
  if (parsed.error || parsed.Error) return false;
  if (parsed.success === false) return false;
  return true;
};

const insertSmsLog = async ({
  templateKey,
  templateId,
  mobile,
  message,
  springedgeMessageId,
  status,
  providerResponse,
  errorCode,
  errorMessage,
  referenceType,
  referenceId,
}) => {
  try {
    await sql.query(
      `INSERT INTO sms_logs
         (template_key, dlt_template_id, mobile, message, springedge_message_id,
          status, provider_response, error_code, error_message,
          reference_type, reference_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`,
      [
        templateKey,
        templateId,
        mobile,
        message,
        springedgeMessageId || null,
        status,
        providerResponse != null ? JSON.stringify(providerResponse) : null,
        errorCode || null,
        errorMessage || null,
        referenceType || null,
        referenceId != null ? referenceId : null,
      ],
    );
  } catch (error) {
    console.error("[sms] Failed to write sms_logs:", error.message);
  }
};

/**
 * Send DLT-approved SMS via SpringEdge.
 * @param {string} templateKey
 * @param {string} mobileNumber
 * @param {object} variables
 * @param {{ reference_type?: string, reference_id?: number|string }} meta
 */
export const sendSms = async (
  templateKey,
  mobileNumber,
  variables = {},
  meta = {},
) => {
  if (!isSmsEnabled()) {
    throw {
      status: 503,
      code: "sms_disabled",
      message: "SMS is not configured (SPRINGEDGE_API_KEY / SPRINGEDGE_SENDER)",
    };
  }

  const apiKey = getSpringEdgeApiKey();
  const sender = getSpringEdgeSender();
  if (!apiKey) {
    throw {
      status: 503,
      code: "invalid_api_key",
      message: "SPRINGEDGE_API_KEY is missing",
    };
  }
  if (!sender) {
    throw {
      status: 503,
      code: "invalid_sender",
      message: "SPRINGEDGE_SENDER is missing",
    };
  }

  const mobile = normalizeMobile(mobileNumber);
  if (!mobile || mobile.length < 12) {
    throw {
      status: 400,
      code: "invalid_mobile",
      message: "Invalid mobile number",
    };
  }

  let built;
  try {
    built = buildSmsMessage(templateKey, variables);
  } catch (error) {
    await insertSmsLog({
      templateKey: templateKey || "UNKNOWN",
      templateId: error.templateId || "",
      mobile: mobile || String(mobileNumber || ""),
      message: "",
      status: "failed",
      errorCode: error.code || "invalid_template_match",
      errorMessage: error.message,
      referenceType: meta.reference_type,
      referenceId: meta.reference_id,
    });
    throw error;
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    sender,
    to: mobile,
    message: built.message,
    format: "json",
  });

  const url = `${getSpringEdgeApiUrl().replace(/\/?$/, "/")}?${params.toString()}`;

  let httpStatus = 0;
  let bodyText = "";
  let parsed = null;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    httpStatus = response.status;
    bodyText = await response.text();
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = bodyText;
    }
  } catch (error) {
    await insertSmsLog({
      templateKey: built.templateKey,
      templateId: built.templateId,
      mobile,
      message: built.message,
      status: "failed",
      providerResponse: { error: error.message },
      errorCode: "network_error",
      errorMessage: error.message || "Network/API failure contacting SpringEdge",
      referenceType: meta.reference_type,
      referenceId: meta.reference_id,
    });
    throw {
      status: 502,
      code: "network_error",
      message: error.message || "Network/API failure contacting SpringEdge",
    };
  }

  const messageId = extractMessageId(parsed);
  const success = isProviderSuccess(httpStatus, parsed);

  if (success && !messageId) {
    console.warn(
      "[sms] SpringEdge success but no message id found. Raw response:",
      typeof parsed === "string" ? parsed : JSON.stringify(parsed),
    );
  }

  if (!success) {
    const mapped = mapProviderError(httpStatus, bodyText, parsed);
    await insertSmsLog({
      templateKey: built.templateKey,
      templateId: built.templateId,
      mobile,
      message: built.message,
      springedgeMessageId: messageId,
      status: "failed",
      providerResponse: parsed ?? { raw: bodyText },
      errorCode: mapped.code,
      errorMessage: mapped.message,
      referenceType: meta.reference_type,
      referenceId: meta.reference_id,
    });
    throw {
      status: 502,
      code: mapped.code,
      message: mapped.message,
      response: parsed,
    };
  }

  await insertSmsLog({
    templateKey: built.templateKey,
    templateId: built.templateId,
    mobile,
    message: built.message,
    springedgeMessageId: messageId,
    status: "success",
    providerResponse: parsed ?? { raw: bodyText },
    referenceType: meta.reference_type,
    referenceId: meta.reference_id,
  });

  return {
    success: true,
    messageId,
    templateKey: built.templateKey,
    templateId: built.templateId,
    response: parsed,
  };
};

/** Fire-and-forget SMS — never throws. */
export const sendSmsSafe = async (
  templateKey,
  mobileNumber,
  variables = {},
  meta = {},
) => {
  if (!isSmsEnabled()) return null;
  if (!mobileNumber) return null;

  try {
    return await sendSms(templateKey, mobileNumber, variables, meta);
  } catch (error) {
    console.error(
      `[sms] Send failed key=${templateKey} code=${error.code || "unknown"}: ${error.message}`,
    );
    return null;
  }
};

/** Resolve user mobile and send SMS safely. */
export const sendSmsToUserSafe = async (
  userId,
  templateKey,
  variables = {},
  meta = {},
) => {
  if (!isSmsEnabled() || !userId) return null;

  try {
    const { rows } = await sql.query(
      `SELECT mobile FROM users WHERE id = $1`,
      [userId],
    );
    const mobile = rows[0]?.mobile;
    if (!mobile) return null;
    return await sendSmsSafe(templateKey, mobile, variables, {
      ...meta,
      reference_type: meta.reference_type || "user",
      reference_id: meta.reference_id ?? userId,
    });
  } catch (error) {
    console.error(`[sms] sendSmsToUserSafe failed: ${error.message}`);
    return null;
  }
};
