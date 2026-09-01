/**
 * High-Concurrency Attendance Attempt Queue
 * Buffers rapid student attendance attempt logs in memory/Redis
 * and flushes them in efficient bulk writes to MongoDB.
 */

const AttendanceAttempt = require("../models/attendanceAttemptSchema");
const redis = require("./redisClient");
const logger = require("./logger");

const memoryQueue = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2500;

let flushTimer = null;

async function enqueueAttempt(attemptData) {
    if (!attemptData) return;

    if (redis) {
        try {
            await redis.lpush("attendify:attempt_queue", JSON.stringify(attemptData));
            const queueLen = await redis.llen("attendify:attempt_queue");
            if (queueLen >= BATCH_SIZE) {
                flushQueue();
            }
            return;
        } catch (err) {
            logger.warn("Redis enqueue failed, falling back to memory queue", { error: err.message });
        }
    }

    memoryQueue.push(attemptData);
    if (memoryQueue.length >= BATCH_SIZE) {
        flushQueue();
    }
}

async function flushQueue() {
    let itemsToInsert = [];

    if (redis) {
        try {
            const pipeline = redis.pipeline();
            for (let i = 0; i < BATCH_SIZE; i++) {
                pipeline.rpop("attendify:attempt_queue");
            }
            const results = await pipeline.exec();
            for (const [err, raw] of results) {
                if (!err && raw) {
                    try {
                        itemsToInsert.push(JSON.parse(raw));
                    } catch (e) {}
                }
            }
        } catch (err) {
            logger.warn("Redis queue pop error", { error: err.message });
        }
    }

    if (memoryQueue.length > 0) {
        const drained = memoryQueue.splice(0, BATCH_SIZE);
        itemsToInsert = itemsToInsert.concat(drained);
    }

    if (itemsToInsert.length === 0) return;

    try {
        await AttendanceAttempt.insertMany(itemsToInsert, { ordered: false });
        logger.info(`[AttendanceQueue] Flushed ${itemsToInsert.length} attendance attempts in bulk.`);
    } catch (err) {
        logger.warn("[AttendanceQueue] Bulk insert partial error:", { error: err.message });
    }
}

// Start periodic flush interval
if (!flushTimer) {
    flushTimer = setInterval(flushQueue, FLUSH_INTERVAL_MS);
    if (flushTimer.unref) flushTimer.unref();
}

module.exports = {
    enqueueAttempt,
    flushQueue
};
