import fs from "fs";
import path from "path";

const MAX_FIELD_BYTES = 10 * 1024;

const SENSITIVE_KEYS = new Set([
  "password",
  "user_password",
  "otp",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "pan_card_number",
  "delivery_otp",
  "jwt",
  "secret",
]);

const LOG_PATH = process.env.API_LOG_PATH || "logs/api.log";
const LOG_DIVIDER = "=".repeat(70);

function ensureLogDir() {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(String(key).toLowerCase());
}

function redact(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(val);
    }
    return result;
  }

  return value;
}

function truncateField(value) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_FIELD_BYTES) {
    return { value, truncated: false };
  }

  return {
    value: `${serialized.slice(0, MAX_FIELD_BYTES)}...[truncated]`,
    truncated: true,
  };
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function formatLogBlock(entry) {
  const lines = ["", LOG_DIVIDER, ""];

  const simpleFields = [
    ["timestamp", entry.timestamp],
    ["method", entry.method],
    ["url", entry.url],
    ["ip", entry.ip],
    ["userId", entry.userId],
    ["statusCode", entry.statusCode],
    ["durationMs", entry.durationMs],
    ["type", entry.type],
    ["message", entry.message],
    ["truncated", entry.truncated],
  ];

  for (const [label, value] of simpleFields) {
    if (value === undefined) continue;
    if (label === "truncated" && !value) continue;
    if ((label === "type" || label === "message") && value === null) continue;
    lines.push(`${label} = ${value}`);
  }

  if (entry.requestBody !== undefined) {
    lines.push("");
    lines.push("requestBody =");
    lines.push(formatValue(entry.requestBody));
  }

  if (entry.response !== undefined) {
    lines.push("");
    lines.push("response =");
    lines.push(formatValue(entry.response));
  }

  lines.push("");
  lines.push(LOG_DIVIDER);
  lines.push("");

  return lines.join("\n");
}

function appendLog(entry) {
  ensureLogDir();
  const block = formatLogBlock(entry);

  fs.appendFile(LOG_PATH, block, (err) => {
    if (err) {
      console.error("Failed to write API log:", err.message);
    }
  });
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function buildLogEntry(req, res, startTime, responseBody) {
  const requestBody = redact(req.body ?? {});
  const response = redact(responseBody ?? null);

  const requestTrunc = truncateField(requestBody);
  const responseTrunc = truncateField(response);

  return {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: getClientIp(req),
    userId: req.user?.id ?? req.user?.userId ?? null,
    requestBody: requestTrunc.value,
    response: responseTrunc.value,
    statusCode: res.statusCode,
    durationMs: Date.now() - startTime,
    truncated: requestTrunc.truncated || responseTrunc.truncated,
  };
}

export function logApiError(err, req) {
  const requestTrunc = truncateField(redact(req.body ?? {}));

  const entry = {
    timestamp: new Date().toISOString(),
    type: "error",
    method: req.method,
    url: req.originalUrl,
    ip: getClientIp(req),
    userId: req.user?.id ?? req.user?.userId ?? null,
    statusCode: err.status || 500,
    message: err.message || "Internal Server Error",
    requestBody: requestTrunc.value,
    truncated: requestTrunc.truncated || undefined,
  };

  appendLog(entry);
}

export function apiLogger(req, res, next) {
  const startTime = Date.now();
  let capturedResponse = null;

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function jsonWrapper(body) {
    capturedResponse = body;
    return originalJson(body);
  };

  res.send = function sendWrapper(body) {
    if (capturedResponse === null) {
      if (typeof body === "string") {
        try {
          capturedResponse = JSON.parse(body);
        } catch {
          capturedResponse = body;
        }
      } else {
        capturedResponse = body;
      }
    }
    return originalSend(body);
  };

  res.on("finish", () => {
    appendLog(buildLogEntry(req, res, startTime, capturedResponse));
  });

  next();
}
