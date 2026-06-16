const rateLimit = require("express-rate-limit");
const logger = require("./logger");

/**
 * Basic rate limiters to prevent brute force or spam on critical endpoints.
 */

// 1. Authentication routes (Login, Passkeys) - Strict
// Max 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: "Too many login attempts, please try again after 15 minutes" },
    handler: (req, res, next, options) => {
        logger.warn("Rate limit exceeded for auth", { ip: req.ip, path: req.originalUrl });
        res.status(options.statusCode).json(options.message);
    }
});

// 2. Attendance Marking - Moderate
// Max 5 attempts per minute per IP
const attendanceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { success: false, message: "Too many attendance requests. Please wait a moment." },
    handler: (req, res, next, options) => {
        logger.warn("Rate limit exceeded for attendance", { ip: req.ip, path: req.originalUrl });
        res.status(options.statusCode).json(options.message);
    }
});

// 3. API General - Lenient
// Max 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: "Too many requests from this IP, please try again later." }
});

module.exports = {
    authLimiter,
    attendanceLimiter,
    apiLimiter
};
