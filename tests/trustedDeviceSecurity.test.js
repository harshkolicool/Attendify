const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getIpPrefix,
    evaluateTrustedDeviceRisk,
    shouldRotateTrustedDeviceToken
} = require("../utils/trustedDeviceSecurity");

test("ip prefix normalization works for IPv4 and IPv6", function () {
    assert.equal(getIpPrefix("103.22.41.78"), "103.22.41");
    assert.equal(getIpPrefix("::ffff:103.22.41.78"), "103.22.41");
    assert.equal(getIpPrefix("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), "2001:0db8:85a3:0000");
});

test("trusted-device risk remains low for expected context", function () {
    const device = {
        userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        lastIpPrefix: "103.22.41",
        lastUsedAt: new Date(Date.now() - 3 * 86400000),
        stepUpVerifiedAt: new Date(Date.now() - 2 * 86400000),
        riskScore: 0
    };

    const risk = evaluateTrustedDeviceRisk(device, {
        hasPasskey: true,
        userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        ip: "103.22.41.99"
    });

    assert.equal(risk.level, "low");
    assert.equal(risk.requireStepUp, false);
});

test("trusted-device risk escalates and requires step-up when profile changes", function () {
    const device = {
        userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
        lastIpPrefix: "103.22.41",
        lastUsedAt: new Date(Date.now() - 95 * 86400000),
        stepUpVerifiedAt: new Date(Date.now() - 30 * 86400000),
        riskScore: 8
    };

    const risk = evaluateTrustedDeviceRisk(device, {
        hasPasskey: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Firefox/126.0",
        ip: "49.33.200.11"
    });

    assert.equal(risk.level, "high");
    assert.equal(risk.requireStepUp, true);
    assert.ok(risk.reasons.length > 0);
});

test("token rotation policy triggers after configured window", function () {
    const oldDevice = {
        tokenRotatedAt: new Date(Date.now() - 80 * 3600000),
        registeredAt: new Date(Date.now() - 100 * 3600000)
    };
    const freshDevice = {
        tokenRotatedAt: new Date(Date.now() - 4 * 3600000),
        registeredAt: new Date(Date.now() - 30 * 3600000)
    };

    assert.equal(
        shouldRotateTrustedDeviceToken(oldDevice, { rotationHours: 72 }),
        true
    );
    assert.equal(
        shouldRotateTrustedDeviceToken(freshDevice, { rotationHours: 72 }),
        false
    );
});
