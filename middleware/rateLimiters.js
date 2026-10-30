import rateLimit from "express-rate-limit";

const limit = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Production only: tests and local runs ask for many codes from one address.
    skip: () => process.env.NODE_ENV !== "production",
    message: { success: false, reason: "tooMany", message },
  });

// Per address: codes cost an email each, and guesses must stay few.
export const codeLimiter = limit(10, "Too many codes asked for. Try again later.");
export const verifyLimiter = limit(30, "Too many tries. Try again later.");
