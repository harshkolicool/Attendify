process.env.TZ = process.env.TZ || "Asia/Kolkata";
require("dotenv").config();

const http = require("http");
const { URL } = require("url");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const socketManager = require("./utils/socketManager");
const realtimeConfig = require("./utils/realtimeConfig");

let startAttendanceExpiryJob = null;

try {
    const attendanceExpiryJob = require("./utils/attendanceExpiryJob");
    startAttendanceExpiryJob = attendanceExpiryJob.startAttendanceExpiryJob;
} catch (err) {
    console.log("Attendance expiry job not loaded:", err.message);
}

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const originRules = (
    process.env.APP_ORIGIN ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1"
)
    .split(",")
    .map(function (origin) {
        return origin.trim().replace(/\/+$/, "");
    })
    .filter(Boolean);

function normalizeOrigin(origin) {
    if (!origin) {
        return "";
    }

    let originStr = String(origin).trim().replace(/\/+$/, "").toLowerCase();

    if (!originStr.startsWith("http://") && !originStr.startsWith("https://")) {
        originStr = "https://" + originStr;
    }

    try {
        const parsed = new URL(originStr);
        return parsed.protocol + "//" + parsed.host;
    } catch (err) {
        return originStr;
    }
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileOriginRule(rule) {
    const cleanedRule = String(rule || "").trim().replace(/\/+$/, "");

    if (!cleanedRule) {
        return null;
    }

    if (cleanedRule.includes("*")) {
        const wildcardRegex = new RegExp(
            "^" + cleanedRule.split("*").map(escapeRegex).join(".*") + "$",
            "i"
        );

        return {
            type: "wildcard",
            match: function (origin) {
                return wildcardRegex.test(origin);
            }
        };
    }

    const normalizedRule = normalizeOrigin(cleanedRule);

    return {
        type: "exact",
        match: function (origin) {
            return origin === normalizedRule;
        }
    };
}

const compiledOriginRules = originRules.map(compileOriginRule).filter(Boolean);

function isLocalHostName(hostname) {
    if (!hostname) {
        return false;
    }

    const safeHost = String(hostname).toLowerCase();
    return safeHost === "localhost" || safeHost === "127.0.0.1" || safeHost === "::1";
}

function isPrivateIPv4Host(hostname) {
    const safeHost = String(hostname || "").toLowerCase();
    const parts = safeHost.split(".");

    if (parts.length !== 4) {
        return false;
    }

    const numbers = parts.map(function (part) {
        return Number(part);
    });

    if (
        numbers.some(function (value) {
            return !Number.isInteger(value) || value < 0 || value > 255;
        })
    ) {
        return false;
    }

    if (numbers[0] === 10) {
        return true;
    }

    if (numbers[0] === 192 && numbers[1] === 168) {
        return true;
    }

    if (numbers[0] === 172 && numbers[1] >= 16 && numbers[1] <= 31) {
        return true;
    }

    if (numbers[0] === 169 && numbers[1] === 254) {
        return true;
    }

    return false;
}

function isDevFriendlyHost(hostname) {
    const safeHost = String(hostname || "").toLowerCase();

    if (!safeHost) {
        return false;
    }

    if (isLocalHostName(safeHost) || isPrivateIPv4Host(safeHost)) {
        return true;
    }

    return safeHost.endsWith(".local");
}

function isOriginAllowed(origin) {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = normalizeOrigin(origin);

    const matchedByRule = compiledOriginRules.some(function (rule) {
        return rule.match(normalizedOrigin);
    });

    if (matchedByRule) {
        return true;
    }

    if (!isProduction) {
        try {
            const parsed = new URL(normalizedOrigin);
            const host = parsed.hostname.toLowerCase();

            if (isDevFriendlyHost(host)) {
                return true;
            }

            if (host.endsWith(".ngrok-free.dev")) {
                return true;
            }
        } catch (err) {
            return false;
        }
    }

    return false;
}

async function startServer() {
    try {
        await connectDB();

        const server = http.createServer(app);

        if (realtimeConfig.isSocketMode()) {
            const io = new Server(server, {
                cors: {
                    origin: function (origin, callback) {
                        if (isOriginAllowed(origin)) {
                            return callback(null, true);
                        }

                        return callback(new Error("Socket origin not allowed by CORS"));
                    },
                    credentials: true
                }
            });

            const sessionMiddleware = app.get("sessionMiddleware");

            if (sessionMiddleware) {
                io.engine.use(sessionMiddleware);
            }

            socketManager.initializeSocket(io);
        } else {
            console.log(
                "Realtime mode: " +
                    realtimeConfig.getRealtimeMode() +
                    " — Socket.IO is disabled."
            );
        }

        /*
            Important fix:
            Start this job only after MongoDB connection is ready.
        */
        if (typeof startAttendanceExpiryJob === "function") {
            startAttendanceExpiryJob();
        }

        server.on("error", function (err) {
            if (err && err.code === "EADDRINUSE") {
                console.error(
                    "Port " +
                        PORT +
                        " is already in use. Stop the existing server or choose another PORT."
                );
                process.exit(1);
            }

            if (err && err.code === "EPERM") {
                console.error(
                    "Server cannot bind to port " +
                        PORT +
                        ". Check local permissions or sandbox restrictions."
                );
                process.exit(1);
            }

            console.error("SERVER START ERROR:");
            console.error(err);
            process.exit(1);
        });

        server.listen(PORT, function () {
            console.log("Server running on http://localhost:" + PORT);
        });
    } catch (err) {
        console.error("SERVER STARTUP FAILED:");
        console.error(err.message);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };