const sessions = new Map();

const STALE_MS = 90000;

function deviceKey(studentId, deviceId) {
    return String(studentId || "") + ":" + String(deviceId || "default");
}

function ensureSession(sessionId) {
    const key = String(sessionId);

    if (!sessions.has(key)) {
        sessions.set(key, {
            devices: new Map()
        });
    }

    return sessions.get(key);
}

function upsertDevice(sessionId, payload, connectionId) {
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

function getSnapshot(sessionId) {
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

function markDeviceOffline(sessionId, studentId, deviceId, connectionId) {
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

function clearSession(sessionId) {
    if (!sessionId) return;
    sessions.delete(String(sessionId));
}

module.exports = {
    upsertDevice,
    getSnapshot,
    markDeviceOffline,
    clearSession
};
