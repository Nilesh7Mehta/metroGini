export const DUMMY_AUTH_MOBILE = "9999988888";
export const DUMMY_AUTH_OTP = "1234";

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
