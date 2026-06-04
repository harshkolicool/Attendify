function normalizeUserAgent(userAgent) {
    return String(userAgent || "").trim().slice(0, 1024);
}

function normalizeIp(ip) {
    return String(ip || "")
        .replace(/^::ffff:/i, "")
        .trim();
}

function getIpPrefix(ip) {
    var normalized = normalizeIp(ip);

    if (!normalized) {
        return "";
    }

    if (normalized.indexOf(":") !== -1) {
        var ipv6Parts = normalized.split(":").filter(Boolean);
        if (ipv6Parts.length === 0) {
            return normalized.slice(0, 12);
        }
        return ipv6Parts.slice(0, 4).join(":");
    }

    var ipv4Parts = normalized.split(".");
    if (ipv4Parts.length >= 3) {
        return ipv4Parts[0] + "." + ipv4Parts[1] + "." + ipv4Parts[2];
    }

    return normalized;
}

function extractBrowserFamily(userAgent) {
    var ua = normalizeUserAgent(userAgent).toLowerCase();

    if (!ua) return "unknown";
    if (ua.indexOf("edg/") !== -1) return "edge";
    if (ua.indexOf("opr/") !== -1 || ua.indexOf("opera") !== -1) return "opera";
    if (ua.indexOf("chrome/") !== -1 && ua.indexOf("edg/") === -1) return "chrome";
    if (ua.indexOf("firefox/") !== -1) return "firefox";
    if (ua.indexOf("safari/") !== -1 && ua.indexOf("chrome/") === -1) return "safari";
    return "other";
}

function extractOsFamily(userAgent) {
    var ua = normalizeUserAgent(userAgent).toLowerCase();

    if (!ua) return "unknown";
    if (ua.indexOf("android") !== -1) return "android";
    if (ua.indexOf("iphone") !== -1 || ua.indexOf("ipad") !== -1 || ua.indexOf("ios") !== -1) return "ios";
    if (ua.indexOf("windows") !== -1) return "windows";
    if (ua.indexOf("mac os") !== -1 || ua.indexOf("macintosh") !== -1) return "macos";
    if (ua.indexOf("linux") !== -1) return "linux";
    return "other";
}

function daysSince(dateValue, nowMs) {
    if (!dateValue) {
        return 9999;
    }

    var ts = new Date(dateValue).getTime();
    if (!Number.isFinite(ts) || ts <= 0) {
        return 9999;
    }

    return Math.max(0, Math.floor((nowMs - ts) / 86400000));
}

function getRiskLevel(score) {
    if (score >= 40) return "high";
    if (score >= 20) return "medium";
    return "low";
}

function evaluateTrustedDeviceRisk(device, context) {
    var nowMs = Number(context && context.nowMs) || Date.now();
    var hasPasskey = Boolean(context && context.hasPasskey);
    var currentUa = normalizeUserAgent(context && context.userAgent);
    var currentIpPrefix = getIpPrefix(context && context.ip);

    var storedUa = normalizeUserAgent(device && device.userAgent);
    var storedIpPrefix = String((device && device.lastIpPrefix) || "").trim();

    var reasons = [];
    var score = 0;

    if (storedUa && currentUa) {
        var storedBrowser = extractBrowserFamily(storedUa);
        var currentBrowser = extractBrowserFamily(currentUa);
        var storedOs = extractOsFamily(storedUa);
        var currentOs = extractOsFamily(currentUa);

        if (storedBrowser !== currentBrowser) {
            score += 26;
            reasons.push("browser-family-changed");
        }

        if (storedOs !== currentOs) {
            score += 18;
            reasons.push("os-family-changed");
        }

        if (storedUa !== currentUa && storedBrowser === currentBrowser && storedOs === currentOs) {
            score += 6;
            reasons.push("ua-changed");
        }
    }

    if (storedIpPrefix && currentIpPrefix && storedIpPrefix !== currentIpPrefix) {
        score += 20;
        reasons.push("ip-prefix-changed");
    }

    var daysFromLastUse = daysSince(device && device.lastUsedAt, nowMs);
    if (daysFromLastUse >= 90) {
        score += 16;
        reasons.push("inactive-90d");
    } else if (daysFromLastUse >= 30) {
        score += 8;
        reasons.push("inactive-30d");
    }

    var daysFromStepUp = daysSince(device && device.stepUpVerifiedAt, nowMs);
    if (hasPasskey && daysFromStepUp >= 14) {
        score += 10;
        reasons.push("stepup-stale");
    }

    var previousRiskScore = Number(device && device.riskScore);
    if (Number.isFinite(previousRiskScore) && previousRiskScore >= 40) {
        score += 6;
        reasons.push("historic-high-risk");
    }

    score = Math.max(0, Math.min(100, score));
    var level = getRiskLevel(score);
    var previousLevel = getRiskLevel(Number(device && device.riskScore) || 0);
    var escalated = score >= ((Number(device && device.riskScore) || 0) + 12) || previousLevel !== level;
    var requireStepUp = hasPasskey && (level === "high" || (escalated && score >= 30));

    return {
        score: score,
        level: level,
        reasons: reasons,
        escalated: escalated,
        requireStepUp: requireStepUp
    };
}

function shouldRotateTrustedDeviceToken(device, options) {
    var nowMs = Number(options && options.nowMs) || Date.now();
    var rotationHours = Number(options && options.rotationHours);
    if (!Number.isFinite(rotationHours) || rotationHours <= 0) {
        rotationHours = 72;
    }

    var baseline = device && (device.tokenRotatedAt || device.registeredAt || device.lastUsedAt);
    var baselineMs = baseline ? new Date(baseline).getTime() : 0;
    if (!Number.isFinite(baselineMs) || baselineMs <= 0) {
        return true;
    }

    var rotationMs = rotationHours * 60 * 60 * 1000;
    return nowMs - baselineMs >= rotationMs;
}

module.exports = {
    normalizeUserAgent,
    getIpPrefix,
    evaluateTrustedDeviceRisk,
    shouldRotateTrustedDeviceToken
};
