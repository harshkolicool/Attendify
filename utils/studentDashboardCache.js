/**
 * In-memory short-lived cache for the heavy student dashboard data.
 * Used to protect the database from mass concurrent reads (thundering herd problem).
 *
 * Storage strategy:
 *  - Redis available: shared cache across all cluster workers (TTL: 15s).
 *  - Redis unavailable: per-worker in-memory Map (original behaviour).
 */

const redis = require("./redisClient");
const logger = require("./logger");

const CACHE_TTL_MS = 15 * 1000; // 15 seconds
const REDIS_KEY_PREFIX = "attendify:dashboardCache:";

// ── In-memory fallback ──────────────────────────────────────────────────────
const dashboardCache = new Map();

function getCachedDashboard(studentId) {
    if (redis) {
        // Redis path — returns a Promise
        return redis.get(REDIS_KEY_PREFIX + studentId).then(function (raw) {
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (_err) {
                return null;
            }
        }).catch(function (err) {
            logger.warn("dashboardCache: Redis get failed", { msg: err.message });
            return null;
        });
    }

    // In-memory path — synchronous, wrapped in a resolved Promise for API consistency
    const entry = dashboardCache.get(studentId);
    if (!entry) return Promise.resolve(null);

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        dashboardCache.delete(studentId);
        return Promise.resolve(null);
    }

    return Promise.resolve(entry.data);
}

function setCachedDashboard(studentId, data) {
    if (redis) {
        const ttlSeconds = Math.ceil(CACHE_TTL_MS / 1000);
        const { attendanceWindow: _omitWindow, ...serializableData } = data || {};
        return redis.set(
            REDIS_KEY_PREFIX + studentId,
            JSON.stringify(serializableData),
            "EX",
            ttlSeconds
        ).catch(function (err) {
            logger.warn("dashboardCache: Redis set failed", { msg: err.message });
        });
    }

    dashboardCache.set(studentId, {
        timestamp: Date.now(),
        data: data
    });
    return Promise.resolve();
}

function invalidateCachedDashboard(studentId) {
    if (redis) {
        return redis.del(REDIS_KEY_PREFIX + studentId).catch(function (err) {
            logger.warn("dashboardCache: Redis del failed", { msg: err.message });
        });
    }

    dashboardCache.delete(studentId);
    return Promise.resolve();
}

module.exports = {
    getCachedDashboard,
    setCachedDashboard,
    invalidateCachedDashboard
};

