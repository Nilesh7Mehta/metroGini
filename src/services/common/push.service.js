import sql from "../../config/db.js";
import { getFirebaseMessaging, isFirebaseEnabled } from "../../config/firebase.js";

const STALE_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const ALLOWED_PLATFORMS = new Set(["android", "ios", "web"]);

export const registerDeviceToken = async ({ userId, fcmToken, platform }) => {
  if (!userId || !fcmToken?.trim()) {
    throw { status: 400, message: "fcm_token is required" };
  }

  const token = fcmToken.trim();
  const normalizedPlatform = ALLOWED_PLATFORMS.has(platform) ? platform : null;

  await sql.query(
    `INSERT INTO device_tokens (identity_id, role, fcm_token, platform, updated_at)
     VALUES ($1, 'user', $2, $3, NOW())
     ON CONFLICT (fcm_token)
     DO UPDATE SET
       identity_id = EXCLUDED.identity_id,
       role = EXCLUDED.role,
       platform = COALESCE(EXCLUDED.platform, device_tokens.platform),
       updated_at = NOW()`,
    [userId, token, normalizedPlatform],
  );

  return { registered: true };
};

export const removeDeviceToken = async (userId, fcmToken) => {
  if (!fcmToken?.trim()) {
    throw { status: 400, message: "fcm_token is required" };
  }

  await sql.query(
    `DELETE FROM device_tokens
     WHERE identity_id = $1 AND role = 'user' AND fcm_token = $2`,
    [userId, fcmToken.trim()],
  );

  return { removed: true };
};

const getUserPushPreference = async (userId) => {
  const { rows } = await sql.query(
    `SELECT push_notification FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.push_notification !== false;
};

export const getUserFcmTokens = async (userId) => {
  const { rows } = await sql.query(
    `SELECT fcm_token FROM device_tokens
     WHERE identity_id = $1 AND role = 'user'`,
    [userId],
  );
  return rows.map((r) => r.fcm_token);
};

const deleteStaleTokens = async (tokens) => {
  if (tokens.length === 0) return;

  await sql.query(
    `DELETE FROM device_tokens WHERE fcm_token = ANY($1::text[])`,
    [tokens],
  );
};

export const sendPushToUser = async (
  userId,
  { title, body, reference_type, reference_id },
) => {
  if (!isFirebaseEnabled()) return;

  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  const pushAllowed = await getUserPushPreference(userId);
  if (!pushAllowed) return;

  const tokens = await getUserFcmTokens(userId);
  if (tokens.length === 0) return;

  const data = {
    role: "user",
    reference_type: reference_type ? String(reference_type) : "",
    reference_id: reference_id != null ? String(reference_id) : "",
  };

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });

  const staleTokens = [];
  response.responses.forEach((res, index) => {
    if (res.success) return;
    const code = res.error?.code;
    if (code && STALE_TOKEN_CODES.has(code)) {
      staleTokens.push(tokens[index]);
    }
  });

  if (staleTokens.length > 0) {
    await deleteStaleTokens(staleTokens);
  }
};

/** Send push without failing the caller (fire-and-forget safe wrapper). */
export const sendPushSafe = async (userId, payload) => {
  if (!isFirebaseEnabled() || !userId) return;

  try {
    await sendPushToUser(userId, payload);
  } catch (error) {
    console.error("[push] Send failed:", error.message);
  }
};

/** Verify Firebase Admin SDK can initialize (for health checks). */
export const verifyFirebaseConnection = async () => {
  if (!isFirebaseEnabled()) {
    throw { status: 503, message: "Firebase is not configured" };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    throw { status: 503, message: "Firebase failed to initialize" };
  }

  return true;
};

/** Send a test push to all registered devices for a user. */
export const sendTestPush = async (userId, { title, body } = {}) => {
  if (!userId) {
    throw { status: 400, message: "user_id is required" };
  }

  await verifyFirebaseConnection();

  const pushAllowed = await getUserPushPreference(userId);
  if (!pushAllowed) {
    throw {
      status: 400,
      message: "Push notifications are disabled for this user",
    };
  }

  const tokens = await getUserFcmTokens(userId);
  if (tokens.length === 0) {
    throw {
      status: 400,
      message: "No FCM token registered. Call PUT /api/user/fcm-token first.",
    };
  }

  const testTitle = title?.trim() || "Metro Gini — Test Push";
  const testBody =
    body?.trim() ||
    `Test notification sent at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`;

  const messaging = getFirebaseMessaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: testTitle, body: testBody },
    data: {
      role: "user",
      reference_type: "test",
      reference_id: "",
    },
  });

  const staleTokens = [];
  response.responses.forEach((res, index) => {
    if (res.success) return;
    const code = res.error?.code;
    if (code && STALE_TOKEN_CODES.has(code)) {
      staleTokens.push(tokens[index]);
    }
  });

  if (staleTokens.length > 0) {
    await deleteStaleTokens(staleTokens);
  }

  if (response.successCount === 0) {
    const firstError = response.responses.find((r) => !r.success)?.error;
    const code = firstError?.code;
    let message = firstError?.message || "Push failed for all registered devices";

    if (code === "messaging/mismatched-credential") {
      message =
        "SenderId mismatch: the FCM token was issued by a different Firebase project than the backend service account. Use the same Firebase project (todo-app-cp-104ac) in your mobile app, get a fresh token, and re-register it.";
    }

    throw {
      status: 502,
      message,
      code,
    };
  }

  return {
    user_id: userId,
    devices: tokens.length,
    success_count: response.successCount,
    failure_count: response.failureCount,
    title: testTitle,
    body: testBody,
  };
};
