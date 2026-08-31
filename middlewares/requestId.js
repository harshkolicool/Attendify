/**
 * X-Request-ID middleware.
 * Attaches a unique trace ID to every request for log correlation.
 * Reads an existing X-Request-ID header from upstream proxies if present.
 */
const crypto = require("crypto");

function requestIdMiddleware(req, res, next) {
    const id = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
    req.id = id;
    res.setHeader("x-request-id", id);
    next();
}

module.exports = requestIdMiddleware;
