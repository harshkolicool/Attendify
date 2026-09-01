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
