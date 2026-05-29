require("dotenv").config();

const crypto = require("crypto");

const ATTENDANCE_SECRET = process.env.ATTENDANCE_TOKEN_SECRET;

if (!ATTENDANCE_SECRET) {
    throw new Error("ATTENDANCE_TOKEN_SECRET is missing in .env file");
}

if (ATTENDANCE_SECRET.length < 32) {
    throw new Error("ATTENDANCE_TOKEN_SECRET must be at least 32 characters long");
}

const rateLimitStore = new Map();

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
    let text = value.replace(/-/g, "+").replace(/_/g, "/");

    while (text.length % 4) {
        text += "=";
    }

    return Buffer.from(text, "base64").toString("utf8");
}

function signBody(body) {
    return base64UrlEncode(
        crypto
            .createHmac("sha256", ATTENDANCE_SECRET)
            .update(body)
            .digest()
    );
}

function safeCompare(a, b) {
    const first = Buffer.from(String(a));
    const second = Buffer.from(String(b));

    if (first.length !== second.length) {
        return false;
    }

    return crypto.timingSafeEqual(first, second);
}



function createAttendanceToken(options) {
    const payload = {
        sid: options.sessionId.toString(),
        stid: options.studentId.toString(),
        cid: options.credentialId ? options.credentialId.toString() : "",
        exp: Date.now() + (options.expiresInSeconds || 120) * 1000,
        jti: crypto.randomBytes(18).toString("hex")
    };

    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = signBody(body);

    return body + "." + signature;
}

function consumeAttendanceToken(token, options) {
    try {
        if (!token || typeof token !== "string") {
            return {
                valid: false,
                message: "Security token missing. Please try again."
            };
        }

        const parts = token.split(".");

        if (parts.length !== 2) {
            return {
                valid: false,
                message: "Invalid security token. Please try again."
            };
        }

        const body = parts[0];
        const signature = parts[1];
        const expectedSignature = signBody(body);

        if (!safeCompare(signature, expectedSignature)) {
            return {
                valid: false,
                message: "Security token verification failed. Please try again."
            };
        }

        const payload = JSON.parse(base64UrlDecode(body));

        if (!payload.exp || Date.now() > payload.exp) {
            return {
                valid: false,
                message: "Security token expired. Please click Mark Attendance again."
            };
        }

        if (payload.sid !== options.sessionId.toString()) {
            return {
                valid: false,
                message: "Security token session mismatch."
            };
        }

        if (payload.stid !== options.studentId.toString()) {
            return {
                valid: false,
                message: "Security token student mismatch."
            };
        }

        return {
            valid: true,
            payload: payload
        };

    } catch (err) {
        return {
            valid: false,
            message: "Invalid security token. Please try again."
        };
    }
}

function allowAttendanceRequest(key, maxRequests, windowMs) {
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, {
            count: 1,
            startTime: now
        });

        return {
            allowed: true
        };
    }

    const data = rateLimitStore.get(key);

    if (now - data.startTime > windowMs) {
        rateLimitStore.set(key, {
            count: 1,
            startTime: now
        });

        return {
            allowed: true
        };
    }

    data.count += 1;

    if (data.count > maxRequests) {
        return {
            allowed: false,
            retryAfter: Math.ceil((windowMs - (now - data.startTime)) / 1000)
        };
    }

    return {
        allowed: true
    };
}

function getClientIp(req) {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || req.connection.remoteAddress || "unknown";
}

module.exports = {
    createAttendanceToken,
    consumeAttendanceToken,
    allowAttendanceRequest,
    getClientIp
};