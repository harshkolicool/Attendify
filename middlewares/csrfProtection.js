const crypto = require("crypto");
const realtimeConfig = require("../utils/realtimeConfig");
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function safeCompare(a, b) {
    const first = Buffer.from(String(a || ""));
    const second = Buffer.from(String(b || ""));

    if (first.length !== second.length) {
        return false;
    }

    return crypto.timingSafeEqual(first, second);
}

function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getSubmittedToken(req) {
    let token = "";

    if (req.body && req.body._csrf) {
        token = req.body._csrf;
    } else if (req.headers["x-csrf-token"]) {
        token = req.headers["x-csrf-token"];
    } else if (req.headers["csrf-token"]) {
        token = req.headers["csrf-token"];
    }

    if (Array.isArray(token)) {
        const firstNonEmpty = token.find(function (value) {
            return Boolean(value);
        });

        return firstNonEmpty || "";
    }

    return token || "";
}

function wantsJson(req) {
    const accept = req.headers.accept || "";
    const contentType = req.headers["content-type"] || "";

    return (
        accept.includes("application/json") ||
        contentType.includes("application/json") ||
        req.xhr
    );
}

function sendCsrfError(req, res) {
    if (wantsJson(req)) {
        return res.status(403).json({
            success: false,
            message: "Invalid or missing security token. Please refresh the page and try again."
        });
    }

    return res.status(403).send(
        "Invalid or missing security token. Please refresh the page and try again."
    );
}



function csrfProtection() {
    return function (req, res, next) {
        if (!req.session) {
            return next(new Error("Session is required before CSRF protection."));
        }

        if (!req.session.csrfToken) {
            req.session.csrfToken = createToken();
        }

        const csrfToken = req.session.csrfToken;

        req.csrfToken = function () {
            return csrfToken;
        };

        res.locals.csrfToken = csrfToken;

        if (SAFE_METHODS.includes(req.method)) {
            return next();
        }

        const submittedToken = getSubmittedToken(req);

        const bodyTokenValues = req.body && Array.isArray(req.body._csrf)
            ? req.body._csrf.filter(Boolean)
            : [];

        const hasMatchingBodyToken = bodyTokenValues.some(function (candidateToken) {
            return safeCompare(candidateToken, csrfToken);
        });

        if (
            (!submittedToken || !safeCompare(submittedToken, csrfToken)) &&
            !hasMatchingBodyToken
        ) {
            return sendCsrfError(req, res);
        }

        next();
    };
}

module.exports = csrfProtection;
