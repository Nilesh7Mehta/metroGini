import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const isEnabledFlag = () => process.env.FIREBASE_ENABLED !== "false";

const resolveServiceAccountPath = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!raw) return null;
  return resolve(process.cwd(), raw);
};

const isConfigured = () => {
  if (!isEnabledFlag()) return false;
  const path = resolveServiceAccountPath();
  return Boolean(path && existsSync(path));
};

const ensureInitialized = () => {
  if (getApps().length > 0) return true;
  if (!isConfigured()) return false;

  try {
    const path = resolveServiceAccountPath();
    const serviceAccount = JSON.parse(readFileSync(path, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
    });
    return true;
  } catch (error) {
    console.error("[firebase] Init failed:", error.message);
    return false;
  }
};

export const isFirebaseEnabled = () => isConfigured();

export const getFirebaseMessaging = () => {
  if (!ensureInitialized()) return null;
  return getMessaging();
};
