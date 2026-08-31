/**
 * Redis client — optional dependency.
 *
 * If REDIS_URL is set in the environment, this module connects to Redis and
 * exports a live ioredis client. Consumers use it for shared in-memory stores,
 * distributed locks, and cluster-safe rate limiting.
 *
 * If REDIS_URL is NOT set, this module exports `null`. All consumers must
 * handle the null case by falling back to in-memory behaviour. This is fine
 * for single-server / development deployments, but is NOT safe for multi-
 * worker cluster mode (each worker will have its own isolated state).
 */

const logger = require("./logger");

let redisClient = null;

function createRedisClient() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        if (process.env.RUNNING_IN_CLUSTER === "true") {
            logger.warn(
                "REDIS_URL is not set. Running in cluster mode without Redis means " +
                "live location store, rate limiters, dashboard cache, and job locks " +
                "are NOT shared between workers. Set REDIS_URL for production cluster deployments."
            );
        }
        return null;
    }

    let Redis;

    try {
        Redis = require("ioredis");
    } catch (_err) {
        logger.warn(
            "ioredis is not installed but REDIS_URL is set. " +
            "Run `npm install ioredis` to enable Redis features. Falling back to in-memory."
        );
        return null;
    }

    const client = new Redis(redisUrl, {
        lazyConnect: false,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
        retryStrategy: function (times) {
            if (times > 10) {
                logger.error("Redis: too many reconnect attempts. Giving up.");
                return null;
            }
            return Math.min(times * 100, 3000);
        }
    });

    client.on("connect", function () {
        logger.info("Redis connected");
    });

    client.on("error", function (err) {
        logger.error("Redis error", { msg: err.message });
    });

    client.on("reconnecting", function () {
        logger.warn("Redis reconnecting...");
    });

    return client;
}

redisClient = createRedisClient();

module.exports = redisClient;
