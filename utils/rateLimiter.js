const rateLimit = require("express-rate-limit");
const logger = require("./logger");
const redis = require("./redisClient");

/**
 * Basic rate limiters to prevent brute force or spam on critical endpoints.
 *
 * When REDIS_URL is configured, all limiters use a shared Redis store so that
 * limits are enforced correctly across all cluster workers.
 * Without Redis, the default in-memory store is used (per-worker, fine for single-server).
 */

function buildStore() {
    if (!redis) {
        return undefined; // express-rate-limit default: in-memory
    }

    let RedisStore;

    try {
        const { default: RateLimitRedis } = require("rate-limit-redis");
        RedisStore = RateLimitRedis;
    } catch (_err) {
        logger.warn(
            "rate-limit-redis is not installed but REDIS_URL is set. " +
            "Run `npm install rate-limit-redis` for cluster-safe rate limiting. " +
            "Falling back to in-memory store."
        );
        return undefined;
    }

    return new RedisStore({
        sendCommand: function (...args) {
            return redis.call(...args);
        }
    });
}

// 1. Authentication routes (Login, Passkeys) - Strict
// Max 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    store: buildStore(),
    message: { success: false, message: "Too many login attempts, please try again after 15 minutes" },
    handler: (req, res, next, options) => {
        logger.warn("Rate limit exceeded for auth", { ip: req.ip, path: req.originalUrl });
        res.status(options.statusCode).json(options.message);
    }
});

// 2. Attendance Marking - Per-student rate limiting (classroom Wi-Fi / tunnel friendly)
const attendanceLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 attempts per minute per student/device
    store: buildStore(),
    validate: { keyGeneratorIpFallback: false, xForwardedForHeader: false },
    keyGenerator: (req) => {
        if (req.session && (req.session.studentId || req.session.userId)) {
            return "student:" + String(req.session.studentId || req.session.userId);
        }
        if (req.user && req.user._id) {
            return "student:" + String(req.user._id);
        }
        return "ip:" + (req.ip || "127.0.0.1");
    },
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
    store: buildStore(),
    message: { success: false, message: "Too many requests from this IP, please try again later." }
});

module.exports = {
    authLimiter,
    attendanceLimiter,
    apiLimiter
};

