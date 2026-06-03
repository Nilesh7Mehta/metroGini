import rateLimit from "express-rate-limit";

// 🔐 Send OTP limiter
export const sendOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 300,
  message: {
    success: false,
    message: "Too many OTP requests. Try again after 10 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 🔐 Verify OTP limiter
export const verifyOtpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: {
    success: false,
    message: "Too many OTP attempts. Try again after 1 minute"
  }
});

// 🔐 Vendor auth (login / register)
export const vendorAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many auth attempts. Please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 🔐 Global API limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: "Too many requests from this IP. Please try later"
  }
});