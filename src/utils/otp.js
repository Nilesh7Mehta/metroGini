import dotenv from "dotenv";

dotenv.config();

export const DUMMY_AUTH_MOBILE = "9999988888";
export const DUMMY_AUTH_OTP = "1234";

const parsedOtpExpiryMinutes = Number(process.env.OTP_EXPIRY);
/** User login OTP lifetime in minutes. Reads OTP_EXPIRY from .env; fallback 10. */
export const USER_OTP_TTL_MINUTES =
  Number.isFinite(parsedOtpExpiryMinutes) && parsedOtpExpiryMinutes > 0
    ? parsedOtpExpiryMinutes
    : 10;
export const RIDER_OTP_TTL_MINUTES = 2;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

export const isDummyAuthMobile = (mobile) =>
  String(mobile || "").trim() === DUMMY_AUTH_MOBILE;

export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

/** Test mobile always gets fixed OTP; all others get a random OTP. */
export const resolveAuthOtpForMobile = (mobile) => {
  const normalized = String(mobile || "").trim();
  if (normalized === DUMMY_AUTH_MOBILE) return DUMMY_AUTH_OTP;
  return generateOTP();
};

export const otpMatches = (stored, provided) =>
  String(stored ?? "").trim() === String(provided ?? "").trim();

export const isOtpExpired = (expiresAt, now = new Date()) => {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() <= now.getTime();
};

export const getCooldownRemainingSeconds = (
  sentAt,
  cooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS,
  now = new Date(),
) => {
  if (!sentAt) return 0;
  const elapsedMs = now.getTime() - new Date(sentAt).getTime();
  const remaining = Math.ceil((cooldownSeconds * 1000 - elapsedMs) / 1000);
  return remaining > 0 ? remaining : 0;
};

/** Cooldown from otp_expires_at = sent_at + ttl. */
export const getOtpCooldownRemainingSeconds = (
  expiresAt,
  ttlMinutes,
  cooldownSeconds = OTP_RESEND_COOLDOWN_SECONDS,
  now = new Date(),
) => {
  if (!expiresAt || !ttlMinutes) return 0;
  const sentAt = new Date(expiresAt).getTime() - ttlMinutes * 60 * 1000;
  return getCooldownRemainingSeconds(sentAt, cooldownSeconds, now);
};
