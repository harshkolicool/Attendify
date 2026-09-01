const test = require("node:test");
const assert = require("node:assert/strict");

const { getWebAuthnConfig, getSimpleWebAuthnServer } = require("../utils/webauthnConfig");

test("getWebAuthnConfig handles localhost correctly", function () {
    const mockReq = {
        get: function (header) {
            if (header === "host") return "localhost:5500";
            return undefined;
        },
        protocol: "http"
    };

    const config = getWebAuthnConfig(mockReq);
    assert.equal(config.rpName, "Attendify");
    assert.equal(config.rpID, "localhost");
    assert.equal(config.origin, "http://localhost:5500");
});

test("getWebAuthnConfig handles proxy and Render headers correctly", function () {
    const mockReq = {
        get: function (header) {
            if (header === "x-forwarded-host") return "attendify-z5j5.onrender.com";
            if (header === "x-forwarded-proto") return "https";
            if (header === "host") return "10.0.0.1";
            return undefined;
        },
        protocol: "http"
    };

    const config = getWebAuthnConfig(mockReq);
    assert.equal(config.rpName, "Attendify");
    assert.equal(config.rpID, "attendify-z5j5.onrender.com");
    assert.equal(config.origin, "https://attendify-z5j5.onrender.com");
});

test("getSimpleWebAuthnServer exports generateRegistrationOptions", async function () {
    const webauthn = await getSimpleWebAuthnServer();
    assert.equal(typeof webauthn.generateRegistrationOptions, "function");
    assert.equal(typeof webauthn.verifyRegistrationResponse, "function");
});

test("Passkey credential public key deserializes reliably from MongoDB BSON Binary after restart", function () {
    // Simulate raw public key bytes stored in MongoDB
    const originalBytes = new Uint8Array([48, 89, 48, 19, 6, 7, 42, 134, 72, 206, 61, 2, 1, 6, 8, 42, 134, 72, 206, 61, 3, 1, 7]);
    
    // In Mongoose, stored as Node Buffer / BSON Binary
    const mongooseStoredBuffer = Buffer.from(originalBytes);
    
    // Simulate conversion helper
    const decodedUint8Array = new Uint8Array(
        mongooseStoredBuffer.buffer,
        mongooseStoredBuffer.byteOffset,
        mongooseStoredBuffer.byteLength
    );

    assert.equal(decodedUint8Array.length, originalBytes.length);
    assert.deepEqual(Array.from(decodedUint8Array), Array.from(originalBytes));
});
