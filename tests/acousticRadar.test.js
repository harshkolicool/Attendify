const test = require("node:test");
const assert = require("node:assert/strict");

test("Acoustic frequency bin calculations map correctly above human hearing", () => {
    const sampleRate = 44100;
    const fftSize = 2048;
    const binSize = sampleRate / fftSize;

    const binPilot = Math.round(18600 / binSize);
    const binSpace = Math.round(19200 / binSize);
    const binMark  = Math.round(19800 / binSize);

    assert.ok(binPilot > 800, "Pilot bin is in ultrasonic high-frequency region");
    assert.ok(binSpace > binPilot, "Space bin is higher than Pilot");
    assert.ok(binMark > binSpace, "Mark bin is higher than Space");
    assert.notEqual(binPilot, binSpace, "Bins are distinct and non-overlapping");
    assert.notEqual(binSpace, binMark, "Bins are distinct and non-overlapping");
});

test("Acoustic log-distance path loss correctly classifies seating rows", () => {
    function calculateSeatingMetrics(signalPower) {
        let distanceMeters;
        let rowCategory;
        let confidence = Math.min(100, Math.round((signalPower / 255) * 100));

        if (signalPower >= 200) {
            distanceMeters = parseFloat((1.0 + (255 - signalPower) * (2.5 / 55)).toFixed(1));
            rowCategory = "Front Row (1–2)";
        } else if (signalPower >= 140) {
            distanceMeters = parseFloat((3.6 + (200 - signalPower) * (4.4 / 60)).toFixed(1));
            rowCategory = "Middle Row (3–5)";
        } else if (signalPower >= 90) {
            distanceMeters = parseFloat((8.1 + (140 - signalPower) * (6.9 / 50)).toFixed(1));
            rowCategory = "Back Row (6–9)";
        } else {
            distanceMeters = parseFloat((15.1 + (90 - signalPower) * (6.9 / 15)).toFixed(1));
            rowCategory = "Far Seating (10+)";
        }

        return {
            distanceMeters: Math.max(1.0, distanceMeters),
            rowCategory: rowCategory,
            confidence: confidence
        };
    }

    // High signal (Front Row)
    const frontRow = calculateSeatingMetrics(230);
    assert.equal(frontRow.rowCategory, "Front Row (1–2)");
    assert.ok(frontRow.distanceMeters >= 1.0 && frontRow.distanceMeters <= 3.5);
    assert.ok(frontRow.confidence >= 80);

    // Medium signal (Middle Row)
    const middleRow = calculateSeatingMetrics(170);
    assert.equal(middleRow.rowCategory, "Middle Row (3–5)");
    assert.ok(middleRow.distanceMeters >= 3.6 && middleRow.distanceMeters <= 8.0);

    // Faint signal (Back Row)
    const backRow = calculateSeatingMetrics(110);
    assert.equal(backRow.rowCategory, "Back Row (6–9)");
    assert.ok(backRow.distanceMeters >= 8.1 && backRow.distanceMeters <= 15.0);

    // Weak boundary signal
    const farRow = calculateSeatingMetrics(78);
    assert.equal(farRow.rowCategory, "Far Seating (10+)");
    assert.ok(farRow.distanceMeters >= 15.0);
});
