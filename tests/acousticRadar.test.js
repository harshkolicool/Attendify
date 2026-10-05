const test = require("node:test");
const assert = require("node:assert/strict");

test("Acoustic frequency bin calculations map correctly above human hearing (v2.0 standard)", () => {
    const sampleRate = 44100;
    const fftSize = 2048;
    const binSize = sampleRate / fftSize;

    const binPilot = Math.round(18200 / binSize);
    const binSpace = Math.round(18800 / binSize);
    const binMark  = Math.round(19400 / binSize);

    assert.ok(binPilot > 800, "Pilot bin is in ultrasonic high-frequency region (>18kHz)");
    assert.ok(binSpace > binPilot, "Space bin is higher than Pilot");
    assert.ok(binMark > binSpace, "Mark bin is higher than Space");
    assert.notEqual(binPilot, binSpace, "Bins are distinct and non-overlapping");
    assert.notEqual(binSpace, binMark, "Bins are distinct and non-overlapping");
});

test("Acoustic 3-bin window peak detection correctly captures slightly shifted frequencies", () => {
    function getBandPeak(dataArray, freq, binSize) {
        const centerBin = Math.round(freq / binSize);
        const left = dataArray[centerBin - 1] || 0;
        const center = dataArray[centerBin] || 0;
        const right = dataArray[centerBin + 1] || 0;
        return Math.max(left, center, right);
    }

    const sampleRate = 44100;
    const fftSize = 2048;
    const binSize = sampleRate / fftSize;
    const bufferLength = 1024;
    const dataArray = new Uint8Array(bufferLength);

    const centerBin = Math.round(18200 / binSize);
    // Simulate slight clock drift: peak is at centerBin + 1
    dataArray[centerBin + 1] = 195;

    const detectedPeak = getBandPeak(dataArray, 18200, binSize);
    assert.equal(detectedPeak, 195, "3-bin window captured peak even with 1-bin offset drift");
});

test("Acoustic dynamic SNR distinguishes ultrasonic beacon from broadband noise", () => {
    function evaluateSNR(targetPeak, noiseFloor) {
        return targetPeak >= 55 && (targetPeak - noiseFloor >= 12 || targetPeak >= 85);
    }

    // High beacon signal with low noise
    assert.ok(evaluateSNR(150, 40), "Beacon signal clearly accepted");

    // Moderate beacon with very low noise
    assert.ok(evaluateSNR(65, 30), "Low power beacon accepted because SNR delta > 12");

    // High broadband noise floor (e.g. key jangling / hiss) without beacon
    assert.equal(evaluateSNR(50, 48), false, "Broadband noise rejected due to poor SNR delta");
});

test("Acoustic log-distance path loss correctly classifies seating rows (v2.0)", () => {
    function calculateSeatingMetrics(signalPower) {
        let distanceMeters;
        let rowCategory;
        let confidence = Math.min(100, Math.max(50, Math.round((signalPower / 255) * 100)));

        if (signalPower >= 190) {
            distanceMeters = parseFloat((1.0 + (255 - signalPower) * (2.2 / 65)).toFixed(1));
            rowCategory = "Front Row (1–2)";
        } else if (signalPower >= 135) {
            distanceMeters = parseFloat((3.3 + (190 - signalPower) * (3.7 / 55)).toFixed(1));
            rowCategory = "Middle Row (3–5)";
        } else if (signalPower >= 85) {
            distanceMeters = parseFloat((7.1 + (135 - signalPower) * (5.4 / 50)).toFixed(1));
            rowCategory = "Back Row (6–9)";
        } else {
            distanceMeters = parseFloat((12.6 + (85 - signalPower) * (7.4 / 35)).toFixed(1));
            rowCategory = "Far Seating (10+)";
        }

        return {
            distanceMeters: Math.max(1.0, distanceMeters),
            rowCategory: rowCategory,
            confidence: confidence
        };
    }

    // High signal (Front Row)
    const frontRow = calculateSeatingMetrics(220);
    assert.equal(frontRow.rowCategory, "Front Row (1–2)");
    assert.ok(frontRow.distanceMeters >= 1.0 && frontRow.distanceMeters <= 3.3);
    assert.ok(frontRow.confidence >= 80);

    // Medium signal (Middle Row)
    const middleRow = calculateSeatingMetrics(160);
    assert.equal(middleRow.rowCategory, "Middle Row (3–5)");
    assert.ok(middleRow.distanceMeters >= 3.3 && middleRow.distanceMeters <= 7.0);

    // Faint signal (Back Row)
    const backRow = calculateSeatingMetrics(100);
    assert.equal(backRow.rowCategory, "Back Row (6–9)");
    assert.ok(backRow.distanceMeters >= 7.1 && backRow.distanceMeters <= 12.5);

    // Weak boundary signal
    const farRow = calculateSeatingMetrics(70);
    assert.equal(farRow.rowCategory, "Far Seating (10+)");
    assert.ok(farRow.distanceMeters >= 12.6);
});

test("Acoustic challenge token verification accepts exact match and rolling tokens", () => {
    const crypto = require("crypto");
    const baseSecret = "B4F9";

    function verifyAcousticToken(receivedToken, baseToken, timestamp = Date.now()) {
        const received = String(receivedToken || "").toUpperCase().trim();
        const base = String(baseToken || "").toUpperCase().trim();
        if (!received || !base) return false;

        // 1. Direct match
        if (received === base) return true;

        // 2. Rolling window match (anti-replay ±1 window)
        const currentWin = Math.floor(timestamp / 20000);
        for (let w = currentWin - 1; w <= currentWin + 1; w++) {
            const raw = base + ":" + w;
            const rollingToken = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase().slice(0, 4);
            if (received === rollingToken) {
                return true;
            }
        }
        return false;
    }

    // Exact match
    assert.ok(verifyAcousticToken("B4F9", baseSecret));

    // Rolling token for current window
    const currentWin = Math.floor(Date.now() / 20000);
    const validRollingToken = crypto.createHash("sha256").update(baseSecret + ":" + currentWin).digest("hex").toUpperCase().slice(0, 4);
    assert.ok(verifyAcousticToken(validRollingToken, baseSecret));

    // Rolling token for previous window (clock drift allowance)
    const prevRollingToken = crypto.createHash("sha256").update(baseSecret + ":" + (currentWin - 1)).digest("hex").toUpperCase().slice(0, 4);
    assert.ok(verifyAcousticToken(prevRollingToken, baseSecret));

    // Mismatched token
    assert.equal(verifyAcousticToken("FFFF", baseSecret), false);

    // Old expired window token (>2 windows ago)
    const oldExpiredToken = crypto.createHash("sha256").update(baseSecret + ":" + (currentWin - 5)).digest("hex").toUpperCase().slice(0, 4);
    assert.equal(verifyAcousticToken(oldExpiredToken, baseSecret), false);
});

test("Acoustic attendance verification method classifies correctly based on location presence", () => {
    function getVerificationMethod(isAcousticVerified, hasLocation, defaultMethod = "GEOLOCATION") {
        if (isAcousticVerified) {
            return hasLocation ? "PASSKEY_ACOUSTIC_GEOFENCE" : "ULTRASONIC_ACOUSTIC_FALLBACK";
        }
        return defaultMethod;
    }

    // Both ultrasonic and GPS verified
    assert.equal(getVerificationMethod(true, true), "PASSKEY_ACOUSTIC_GEOFENCE");

    // Ultrasonic verified but GPS failed/indoor
    assert.equal(getVerificationMethod(true, false), "ULTRASONIC_ACOUSTIC_FALLBACK");

    // Only GPS verified, no ultrasonic
    assert.equal(getVerificationMethod(false, true, "PASSKEY_GEOLOCATION"), "PASSKEY_GEOLOCATION");
});

test("Acoustic test store registers, retrieves by college, and clears active beacons", () => {
    const acousticTestStore = require("../utils/acousticTestStore");
    const teacherId = "testTeacher123";
    const collegeId = "collegeABC";

    const tokenObj = acousticTestStore.setTestToken(teacherId, {
        token: "E8A2",
        teacherName: "Dr. Smith",
        collegeId: collegeId
    });

    assert.equal(tokenObj.token, "E8A2");

    // Retrieve by teacher
    const byTeacher = acousticTestStore.getTestTokenByTeacher(teacherId);
    assert.ok(byTeacher);
    assert.equal(byTeacher.token, "E8A2");

    // Retrieve active beacon for college
    const forCollege = acousticTestStore.getActiveTestTokenForCollege(collegeId);
    assert.ok(forCollege);
    assert.equal(forCollege.token, "E8A2");

    // Retrieve active beacon via findMatchingTestToken directly
    const directMatch = acousticTestStore.findMatchingTestToken("E8A2", "someOtherCollege");
    assert.ok(directMatch);
    assert.equal(directMatch.teacherId, teacherId);

    // Retrieve active beacon via findMatchingTestToken lowercase
    const lowerMatch = acousticTestStore.findMatchingTestToken("e8a2");
    assert.ok(lowerMatch);
    assert.equal(lowerMatch.token, "E8A2");

    // Clear test token
    acousticTestStore.clearTestToken(teacherId);
    assert.equal(acousticTestStore.getTestTokenByTeacher(teacherId), null);
    assert.equal(acousticTestStore.getActiveTestTokenForCollege(collegeId), null);
    assert.equal(acousticTestStore.findMatchingTestToken("E8A2"), null);
});

test("Acoustic 28 Hz band plan resolves all 16 hex characters without drift at 44.1kHz and 48kHz", () => {
    const BANDS = [
        { base: 18000, step: 28, min: 17980, max: 18450 },
        { base: 18480, step: 28, min: 18460, max: 18930 },
        { base: 18960, step: 28, min: 18940, max: 19410 },
        { base: 19440, step: 28, min: 19420, max: 19890 }
    ];
    const HEX_CHARS = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"];

    for (const sampleRate of [44100, 48000]) {
        for (const fftSize of [4096, 8192]) {
            const binSize = sampleRate / fftSize;

            for (let bandIdx = 0; bandIdx < 4; bandIdx++) {
                const band = BANDS[bandIdx];

                for (let hexVal = 0; hexVal < 16; hexVal++) {
                    const transmittedFreq = band.base + hexVal * band.step;

                    // Simulated FFT detection (finding the highest bin)
                    const peakBin = Math.round(transmittedFreq / binSize);
                    const detectedFreq = peakBin * binSize;

                    let decodedVal = Math.round((detectedFreq - band.base) / band.step);
                    if (decodedVal === 0 || Object.is(decodedVal, -0)) decodedVal = 0;
                    assert.equal(
                        decodedVal,
                        hexVal,
                        `Decoded hex value must match transmitted value (SR=${sampleRate}, FFT=${fftSize}, Band=${bandIdx}, Hex=${HEX_CHARS[hexVal]})`
                    );
                }
            }
        }
    }

    // Specific test for "288D" token that previously drifted
    const testToken = "288D";
    const decodedChars = [];
    const binSize48k = 48000 / 8192;

    for (let i = 0; i < 4; i++) {
        const charVal = parseInt(testToken[i], 16);
        const freq = BANDS[i].base + charVal * BANDS[i].step;
        const peakBin = Math.round(freq / binSize48k);
        const peakFreq = peakBin * binSize48k;
        const decoded = Math.round((peakFreq - BANDS[i].base) / BANDS[i].step);
        decodedChars.push(HEX_CHARS[decoded]);
    }

    assert.equal(decodedChars.join(""), "288D", "Token '288D' must decode exactly as '288D' with zero drift on Android 48kHz audio context");
});


