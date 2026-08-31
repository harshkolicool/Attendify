/**
 * Distributed job lock — prevents the same background job from running
 * on multiple cluster workers simultaneously.
 *
 * Strategy:
 *  - If Redis is available: uses SET NX EX (atomic compare-and-set). Only the
 *    first worker to acquire the key within the TTL window runs the job.
 *  - If Redis is NOT available: falls back to a worker-ID check. Only the
 *    worker with CLUSTER_WORKER_ID=1 (or a non-cluster server) runs the job.
 *    This is not truly distributed but prevents N×duplicates in the common case.
 */

const logger = require("./logger");
const redis = require("./redisClient");

const DEFAULT_LOCK_TTL_MS = 55 * 1000; // 55s — slightly shorter than the 60s job interval

/**
 * Attempts to acquire a named lock.
 *
 * @param {string} lockName - Unique name for this lock (e.g. "attendance-expiry-job")
 * @param {number} [ttlMs]  - How long the lock lives (milliseconds). Defaults to 55s.
 * @returns {Promise<boolean>} - true if the lock was acquired (caller should run the job)
 */
async function acquireLock(lockName, ttlMs) {
    const ttl = ttlMs || DEFAULT_LOCK_TTL_MS;
    const key = "attendify:lock:" + lockName;

    if (redis) {
        try {
            // SET key workerId NX PX ttl — returns "OK" on success, null if key already exists
            const workerId = process.env.CLUSTER_WORKER_ID || "1";
            const result = await redis.set(key, workerId, "NX", "PX", ttl);
            return result === "OK";
        } catch (err) {
            logger.warn("jobLock: Redis SET NX failed, falling back to worker-ID lock", { msg: err.message });
        }
    }

    // Fallback: allow only CLUSTER_WORKER_ID=1 (or non-cluster server)
    const workerId = process.env.CLUSTER_WORKER_ID;
    if (workerId && workerId !== "1") {
        return false;
    }

    return true;
}

/**
 * Releases a previously acquired lock early (before TTL expires).
 * Optional — locks auto-expire via TTL, so this is just for cleanliness.
 *
 * @param {string} lockName
 * @param {string} [lockValue] - The value set when the lock was acquired (worker ID)
 */
async function releaseLock(lockName) {
    if (!redis) return;

    const key = "attendify:lock:" + lockName;

    try {
        await redis.del(key);
    } catch (err) {
        logger.warn("jobLock: failed to release lock", { lockName, msg: err.message });
    }
}

module.exports = { acquireLock, releaseLock };
