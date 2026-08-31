/**
 * Live location store — tracks real-time student device positions per attendance session.
 *
 * Storage strategy:
 *  - Redis available: uses Redis Hashes keyed by session ID. Data is shared across
 *    all cluster workers and persists through worker restarts. TTL: 10 minutes.
 *  - Redis unavailable: falls back to an in-process Map. Correct for single-server
 *    deployments. In cluster mode, each worker has its own view (set REDIS_URL to fix).
 */

const redis = require("./redisClient");
const logger = require("./logger");

// ── In-memory fallback ──────────────────────────────────────────────────────
const sessions = new Map();
const STALE_MS = 90000;
const REDIS_SESSION_TTL_SECONDS = 10 * 60; // 10 minutes
const REDIS_KEY_PREFIX = "attendify:liveLocation:";

function deviceKey(studentId, deviceId) {
    return String(studentId || "") + ":" + String(deviceId || "default");
}

// ── In-memory helpers (used when Redis is unavailable) ─────────────────────

function ensureSession(sessionId) {
    const key = String(sessionId);

    if (!sessions.has(key)) {
        sessions.set(key, {
            devices: new Map()
        });
    }

    return sessions.get(key);
}

function upsertDeviceMemory(sessionId, payload, connectionId) {
    if (!sessionId || !payload || !payload.studentId) {
        return null;
    }

    const bucket = ensureSession(sessionId);
    const key = deviceKey(payload.studentId, payload.deviceId);
    const now = Date.now();

    const existing = bucket.devices.get(key) || {};

    const connectionIds = existing.connectionIds instanceof Set
        ? existing.connectionIds
        : new Set();

    if (connectionId) {
        connectionIds.add(String(connectionId));
    }

    const next = {
        sessionId: String(sessionId),
        studentId: String(payload.studentId),
        studentName: payload.studentName || existing.studentName || "Student",
        enrollmentNumber: payload.enrollmentNumber || existing.enrollmentNumber || "",
        deviceId: payload.deviceId ? String(payload.deviceId) : existing.deviceId || "default",
        deviceLabel: payload.deviceLabel || existing.deviceLabel || "Device",
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        accuracy: payload.accuracy === null || payload.accuracy === undefined ? null : Number(payload.accuracy),
        distance: Number(payload.distance || 0),
        configuredRadius: Number(payload.configuredRadius || existing.configuredRadius || 0),
        effectiveRadius: Number(payload.effectiveRadius || existing.effectiveRadius || 0),
        inside: Boolean(payload.inside),
        status: payload.status || existing.status || "UNKNOWN",
        reasonCode: payload.reasonCode || existing.reasonCode || "",
        updatedAt: payload.updatedAt || new Date(),
        lastSeenAt: now,
        online: true,
        connectionIds: connectionIds
    };

    bucket.devices.set(key, next);
    return next;
}

function getSnapshotMemory(sessionId) {
    const bucket = sessions.get(String(sessionId));

    if (!bucket) {
        return [];
    }

    const now = Date.now();
    const list = [];

    bucket.devices.forEach(function (device) {
        const copy = Object.assign({}, device);
        delete copy.connectionIds;

        if (
            now - Number(device.lastSeenAt || 0) > STALE_MS ||
            !(device.connectionIds instanceof Set) ||
            device.connectionIds.size === 0
        ) {
            copy.online = false;
        }

        list.push(copy);
    });

    return list;
}

function markDeviceOfflineMemory(sessionId, studentId, deviceId, connectionId) {
    const bucket = sessions.get(String(sessionId));

    if (!bucket || !studentId) {
        return [];
    }

    const key = deviceKey(studentId, deviceId);
    const device = bucket.devices.get(key);

    if (!device) {
        return [];
    }

    if (device.connectionIds instanceof Set && connectionId) {
        device.connectionIds.delete(String(connectionId));
    }

    if (device.connectionIds instanceof Set && device.connectionIds.size > 0) {
        return [];
    }

    device.online = false;
    device.lastSeenAt = Date.now();

    const copy = Object.assign({}, device);
    delete copy.connectionIds;

    return [copy];
}

function clearSessionMemory(sessionId) {
    if (!sessionId) return;
    sessions.delete(String(sessionId));
}

// ── Redis helpers (used when Redis is available) ────────────────────────────

function redisSessionKey(sessionId) {
    return REDIS_KEY_PREFIX + String(sessionId);
}

async function upsertDeviceRedis(sessionId, payload, connectionId) {
    if (!sessionId || !payload || !payload.studentId) {
        return null;
    }

    const redisKey = redisSessionKey(sessionId);
    const field = deviceKey(payload.studentId, payload.deviceId);
    const now = Date.now();

    let existing = {};

    try {
        const raw = await redis.hget(redisKey, field);
        if (raw) {
            existing = JSON.parse(raw);
        }
    } catch (_err) {
        // tolerate parse errors — treat as empty
    }

    // Merge connection IDs (stored as an array in Redis)
    const connectionIds = Array.isArray(existing._connectionIds) ? existing._connectionIds : [];
    if (connectionId && !connectionIds.includes(String(connectionId))) {
        connectionIds.push(String(connectionId));
    }

    const next = {
        sessionId: String(sessionId),
        studentId: String(payload.studentId),
        studentName: payload.studentName || existing.studentName || "Student",
        enrollmentNumber: payload.enrollmentNumber || existing.enrollmentNumber || "",
        deviceId: payload.deviceId ? String(payload.deviceId) : existing.deviceId || "default",
        deviceLabel: payload.deviceLabel || existing.deviceLabel || "Device",
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        accuracy: payload.accuracy === null || payload.accuracy === undefined ? null : Number(payload.accuracy),
        distance: Number(payload.distance || 0),
        configuredRadius: Number(payload.configuredRadius || existing.configuredRadius || 0),
        effectiveRadius: Number(payload.effectiveRadius || existing.effectiveRadius || 0),
        inside: Boolean(payload.inside),
        status: payload.status || existing.status || "UNKNOWN",
        reasonCode: payload.reasonCode || existing.reasonCode || "",
        updatedAt: (payload.updatedAt || new Date()).toISOString(),
        lastSeenAt: now,
        online: true,
        _connectionIds: connectionIds
    };

    try {
        await redis.hset(redisKey, field, JSON.stringify(next));
        await redis.expire(redisKey, REDIS_SESSION_TTL_SECONDS);
    } catch (err) {
        logger.warn("liveLocationStore: Redis write failed", { msg: err.message });
    }

    return next;
}

async function getSnapshotRedis(sessionId) {
    const redisKey = redisSessionKey(sessionId);
    const now = Date.now();
    let fields;

    try {
        fields = await redis.hvals(redisKey);
    } catch (err) {
        logger.warn("liveLocationStore: Redis read failed", { msg: err.message });
        return [];
    }

    return fields.map(function (raw) {
        try {
            const device = JSON.parse(raw);
            const copy = Object.assign({}, device);
            const connectionIds = Array.isArray(copy._connectionIds) ? copy._connectionIds : [];
            delete copy._connectionIds;

            if (
                now - Number(device.lastSeenAt || 0) > STALE_MS ||
                connectionIds.length === 0
            ) {
                copy.online = false;
            }

            return copy;
        } catch (_err) {
            return null;
        }
    }).filter(Boolean);
}

async function markDeviceOfflineRedis(sessionId, studentId, deviceId, connectionId) {
    const redisKey = redisSessionKey(sessionId);
    const field = deviceKey(studentId, deviceId);
    let device;

    try {
        const raw = await redis.hget(redisKey, field);
        if (!raw) return [];
        device = JSON.parse(raw);
    } catch (_err) {
        return [];
    }

    const connectionIds = Array.isArray(device._connectionIds) ? device._connectionIds : [];
    const updated = connectionId
        ? connectionIds.filter(function (id) { return id !== String(connectionId); })
        : [];

    device._connectionIds = updated;

    if (updated.length > 0) {
        // Still has other connections — just save without marking offline
        try {
            await redis.hset(redisKey, field, JSON.stringify(device));
        } catch (_err) { /* ignore */ }
        return [];
    }

    device.online = false;
    device.lastSeenAt = Date.now();

    try {
        await redis.hset(redisKey, field, JSON.stringify(device));
    } catch (_err) { /* ignore */ }

    const copy = Object.assign({}, device);
    delete copy._connectionIds;
    return [copy];
}

async function clearSessionRedis(sessionId) {
    if (!sessionId) return;

    try {
        await redis.del(redisSessionKey(sessionId));
    } catch (err) {
        logger.warn("liveLocationStore: Redis del failed", { msg: err.message });
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

function upsertDevice(sessionId, payload, connectionId) {
    if (redis) {
        return upsertDeviceRedis(sessionId, payload, connectionId);
    }
    return Promise.resolve(upsertDeviceMemory(sessionId, payload, connectionId));
}

function getSnapshot(sessionId) {
    if (redis) {
        return getSnapshotRedis(sessionId);
    }
    return Promise.resolve(getSnapshotMemory(sessionId));
}

function markDeviceOffline(sessionId, studentId, deviceId, connectionId) {
    if (redis) {
        return markDeviceOfflineRedis(sessionId, studentId, deviceId, connectionId);
    }
    return Promise.resolve(markDeviceOfflineMemory(sessionId, studentId, deviceId, connectionId));
}

function clearSession(sessionId) {
    if (redis) {
        return clearSessionRedis(sessionId);
    }
    clearSessionMemory(sessionId);
    return Promise.resolve();
}

module.exports = {
    upsertDevice,
    getSnapshot,
    markDeviceOffline,
    clearSession
};

