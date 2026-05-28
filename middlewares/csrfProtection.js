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
    } else if (req.query && req.query._csrf) {
        token = req.query._csrf;
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

function injectMetaTag(html, escapedToken) {
    if (html.includes('name="csrf-token"')) {
        return html;
    }

    const metaTag = '\n<meta name="csrf-token" content="' + escapedToken + '">\n';

    if (html.includes("</head>")) {
        return html.replace("</head>", metaTag + "</head>");
    }

    return metaTag + html;
}


function injectRealtimeConfig(html) {
    if (html.includes("window.AttendifyRealtimeConfig")) {
        return html;
    }

    const mode = JSON.stringify(realtimeConfig.getRealtimeMode());
    const pollIntervalMs = Number(realtimeConfig.getPollIntervalMs()) || 5000;

    const scriptTag =
        "\n<script>\n" +
        "window.AttendifyRealtimeConfig = {\n" +
        "    mode: " + mode + ",\n" +
        "    pollIntervalMs: " + pollIntervalMs + "\n" +
        "};\n" +
        "</script>\n";

    if (html.includes("</head>")) {
        return html.replace("</head>", scriptTag + "</head>");
    }

    return scriptTag + html;
}

function injectGlobalAssets(html) {
    let output = html;


    if (!output.includes("/css/uiShell.css")) {
        const linkTag = '\n<link rel="stylesheet" href="/css/uiShell.css">\n';

        if (output.includes("</head>")) {
            output = output.replace("</head>", linkTag + "</head>");
        } else {
            output = linkTag + output;
        }
    }

    if (!output.includes("/css/finalUiFix.css")) {
        const finalCssTag = '\n<link rel="stylesheet" href="/css/finalUiFix.css">\n';

        if (output.includes("</head>")) {
            output = output.replace("</head>", finalCssTag + "</head>");
        } else {
            output = finalCssTag + output;
        }
    }


    if (!output.includes("/js/csrfAuto.js")) {
        const csrfScript = '\n<script src="/js/csrfAuto.js" defer></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", csrfScript + "</body>");
        } else {
            output += csrfScript;
        }
    }

    if (!output.includes("/js/selectEnhancer.js")) {
        const selectEnhancerScript = '\n<script src="/js/selectEnhancer.js" defer></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", selectEnhancerScript + "</body>");
        } else {
            output += selectEnhancerScript;
        }
    }

    if (!output.includes("/js/locationStabilizer.js")) {
        const stabilizerScript = '\n<script src="/js/locationStabilizer.js"></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", stabilizerScript + "</body>");
        } else {
            output += stabilizerScript;
        }
    }

    if (!output.includes("/js/uiShell.js")) {
        const uiScript = '\n<script src="/js/uiShell.js" defer></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", uiScript + "</body>");
        } else {
            output += uiScript;
        }
    }

    if (
        (output.includes("/js/studentRealtime.js") || output.includes("studentRealtime.js")) &&
        !output.includes("/js/studentLiveLocation.js")
    ) {
        const studentLiveScript = '\n<script src="/js/studentLiveLocation.js"></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", studentLiveScript + "</body>");
        } else {
            output += studentLiveScript;
        }
    }

    if (
        output.includes("/css/teacherDashboard.css") &&
        !output.includes("/js/teacherNav.js")
    ) {
        const teacherNavScript = '\n<script src="/js/teacherNav.js" defer></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", teacherNavScript + "</body>");
        } else {
            output += teacherNavScript;
        }
    }

    if (
        (output.includes("/css/adminTheme.css") || output.includes("adminTheme.css")) &&
        !output.includes("/js/adminRealtime.js")
    ) {
        const adminRealtimeScript = '\n<script src="/js/adminRealtime.js"></script>\n';

        if (output.includes("</body>")) {
            output = output.replace("</body>", adminRealtimeScript + "</body>");
        } else {
            output += adminRealtimeScript;
        }
    }

    return output;
}

function injectHiddenInputIntoPostForms(html, escapedToken) {
    return html.replace(/<form\b([^>]*)>/gi, function (formTag, attributes) {
        const hasPostMethod = /\bmethod\s*=\s*["']?post["']?/i.test(attributes);

        if (!hasPostMethod) {
            return formTag;
        }

        return (
            formTag +
            '\n<input type="hidden" name="_csrf" value="' +
            escapedToken +
            '">'
        );
    });
}

function injectCsrfIntoHtml(html, token) {
    if (typeof html !== "string") {
        return html;
    }

    const escapedToken = escapeHtmlAttribute(token);

    let output = html;

    output = injectMetaTag(output, escapedToken);
    output = injectRealtimeConfig(output);
    output = injectHiddenInputIntoPostForms(output, escapedToken);
    output = injectGlobalAssets(output);

    return output;
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

        const originalSend = res.send.bind(res);

        res.send = function (body) {
            const contentType = res.getHeader("Content-Type") || "";

            const looksLikeHtml =
                typeof body === "string" &&
                (
                    contentType.toString().includes("text/html") ||
                    body.includes("<html") ||
                    body.includes("<!DOCTYPE html")
                );

            if (looksLikeHtml) {
                body = injectCsrfIntoHtml(body, csrfToken);
            }

            return originalSend(body);
        };

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
