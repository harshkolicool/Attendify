/**
 * In-memory short-lived cache for the heavy student dashboard data.
 * Used to protect the database from mass concurrent reads (thundering herd problem).
 */

const CACHE_TTL_MS = 15 * 1000; // 15 seconds
const dashboardCache = new Map();

function getCachedDashboard(studentId) {
    const entry = dashboardCache.get(studentId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        dashboardCache.delete(studentId);
        return null;
    }

    return entry.data;
}

function setCachedDashboard(studentId, data) {
    dashboardCache.set(studentId, {
        timestamp: Date.now(),
        data: data
    });
}

function invalidateCachedDashboard(studentId) {
    dashboardCache.delete(studentId);
}

module.exports = {
    getCachedDashboard,
    setCachedDashboard,
    invalidateCachedDashboard
};
