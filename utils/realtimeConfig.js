/**
 * Realtime mode configuration for Attendify.
 *
 * Modes:
 *   "socket"   – Socket.IO WebSocket (default for local / VPS hosting)
 *   "polling"  – HTTP polling fallback (for Vercel / serverless)
 *   "disabled" – No realtime at all
 *   "auto"     – Detect: use "polling" on Vercel, "socket" elsewhere
 */

const VALID_MODES = ["socket", "polling", "disabled", "auto"];

function getRealtimeMode() {
    var raw = (process.env.REALTIME_MODE || "auto").trim().toLowerCase();

    if (VALID_MODES.indexOf(raw) === -1) {
        raw = "auto";
    }

    if (raw === "auto") {
        // Vercel sets VERCEL=1 in the environment automatically
        return process.env.VERCEL === "1" ? "polling" : "socket";
    }

    return raw;
}

function isSocketMode() {
    return getRealtimeMode() === "socket";
}

function isPollingMode() {
    return getRealtimeMode() === "polling";
}

function isDisabledMode() {
    return getRealtimeMode() === "disabled";
}

function getPollIntervalMs() {
    var val = Number(process.env.REALTIME_POLL_INTERVAL_MS);
    return Number.isFinite(val) && val >= 1000 ? val : 5000;
}

module.exports = {
    getRealtimeMode: getRealtimeMode,
    isSocketMode: isSocketMode,
    isPollingMode: isPollingMode,
    isDisabledMode: isDisabledMode,
    getPollIntervalMs: getPollIntervalMs
};
