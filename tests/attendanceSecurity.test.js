const test = require("node:test");
const assert = require("node:assert/strict");

process.env.ATTENDANCE_TOKEN_SECRET = process.env.ATTENDANCE_TOKEN_SECRET || "01234567890123456789012345678901";

const {
    createAttendanceToken,
    consumeAttendanceToken
} = require("../utils/attendanceSecurity");

test("attendance token validates for correct session and student", function () {
    const token = createAttendanceToken({
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2",
        credentialId: "PASSKEY:cred-1",
        expiresInSeconds: 120
    });

    const result = consumeAttendanceToken(token, {
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2"
    });

    assert.equal(result.valid, true);
    assert.ok(result.payload);
    assert.equal(result.payload.cid, "PASSKEY:cred-1");
});

test("tampered attendance token is rejected", function () {
    const token = createAttendanceToken({
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2",
        credentialId: "PASSKEY:cred-1",
        expiresInSeconds: 120
    });

    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const result = consumeAttendanceToken(tampered, {
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2"
    });

    assert.equal(result.valid, false);
});

test("expired attendance token is rejected", function () {
    const token = createAttendanceToken({
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2",
        credentialId: "PASSKEY:cred-1",
        expiresInSeconds: -1
    });

    const result = consumeAttendanceToken(token, {
        sessionId: "681f7d95522ae2f0a5a92aa1",
        studentId: "681f7da2522ae2f0a5a92bb2"
    });

    assert.equal(result.valid, false);
    assert.match(result.message, /expired|invalid/i);
});
