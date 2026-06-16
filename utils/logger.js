/**
 * Lightweight structured logger — no external dependencies.
 * In production, outputs JSON lines. In development, outputs colored text.
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('Server started', { port: 3000 });
 *   logger.warn('High GPS error rate', { count: 12 });
 *   logger.error('DB connection failed', { err: err.message });
 */

const isDev = process.env.NODE_ENV !== "production";

const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

const COLORS = {
    debug: "\x1b[36m",   // cyan
    info:  "\x1b[32m",   // green
    warn:  "\x1b[33m",   // yellow
    error: "\x1b[31m"    // red
};

const RESET = "\x1b[0m";

function formatDev(level, message, data) {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const color = COLORS[level] || "";
    const label = level.toUpperCase().padEnd(5);
    let output = color + "[" + ts + "] " + label + " " + RESET + message;

    if (data && Object.keys(data).length > 0) {
        try {
            output += " " + JSON.stringify(data);
        } catch (e) {
            output += " [unstringifiable data]";
        }
    }

    return output;
}

function formatProd(level, message, data) {
    const entry = {
        time: new Date().toISOString(),
        level: level,
        msg: message
    };

    if (data) {
        Object.assign(entry, data);
    }

    try {
        return JSON.stringify(entry);
    } catch (e) {
        return JSON.stringify({ time: entry.time, level: level, msg: message });
    }
}

function log(level, message, data) {
    const minLevel = LEVELS[process.env.LOG_LEVEL] !== undefined
        ? LEVELS[process.env.LOG_LEVEL]
        : LEVELS.info;

    if (LEVELS[level] < minLevel) {
        return;
    }

    const output = isDev
        ? formatDev(level, message, data)
        : formatProd(level, message, data);

    if (level === "error" || level === "warn") {
        process.stderr.write(output + "\n");
    } else {
        process.stdout.write(output + "\n");
    }
}

const logger = {
    debug: function(message, data) { log("debug", message, data); },
    info:  function(message, data) { log("info",  message, data); },
    warn:  function(message, data) { log("warn",  message, data); },
    error: function(message, data) { log("error", message, data); }
};

module.exports = logger;
