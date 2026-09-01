const test = require("node:test");
const assert = require("node:assert/strict");

const {
    evaluateLocationRange,
    getAdaptiveConfidenceThreshold
} = require("../utils/locationVerification");

test("adaptive confidence threshold increases for small radius and weak network", function () {
    const threshold = getAdaptiveConfidenceThreshold(20, {
        sampleCount: 6,
        network: {
            effectiveType: "3g",
            rtt: 320,
            downlink: 0.8
        }
    });

    assert.equal(typeof threshold, "number");
    assert.ok(threshold >= 55);
});

test("strongly inside position passes even with low confidence", function () {
    const evaluation = evaluateLocationRange(
        12.9716,
        77.5946,
        12.9716,
        77.5946,
        25,
        12,
        6,
        {
            studentLocationMeta: {
                confidenceScore: 28,
                sampleCount: 7,
                network: {
                    effectiveType: "3g",
                    rtt: 280,
                    downlink: 0.9
                }
            }
        }
    );

    assert.equal(evaluation.isOutside, false);
    assert.equal(evaluation.shouldRetry, false);
    assert.equal(evaluation.decision, "PASS");
});

test("boundary-ambiguous low-confidence fix requests retry", function () {
    const evaluation = evaluateLocationRange(
        12.9716,
        77.5946,
        12.97203,
        77.5946,
        50,
        8,
        5,
        {
            studentLocationMeta: {
                confidenceScore: 50,
                sampleCount: 12,
                network: {
                    effectiveType: "4g",
                    rtt: 120,
                    downlink: 5
                }
            }
        }
    );

    assert.equal(evaluation.isOutside, false);
    assert.equal(evaluation.shouldRetry, true);
    assert.equal(evaluation.reasonCode, "GPS_LOW_CONFIDENCE");
});

test("clearly outside position fails", function () {
    const evaluation = evaluateLocationRange(
        12.9716,
        77.5946,
        12.9805,
        77.5946,
        80,
        20,
        8
    );

    assert.equal(evaluation.isOutside, true);
    assert.equal(evaluation.decision, "FAIL");
});

test("isValidCoordinate rejects (0, 0) and out-of-range coordinates", function () {
    const { isValidCoordinate } = require("../utils/locationVerification");
    assert.equal(isValidCoordinate(0, 0), false);
    assert.equal(isValidCoordinate(0.0, 0.0), false);
    assert.equal(isValidCoordinate(12.9716, 77.5946), true);
    assert.equal(isValidCoordinate(95, 77.5946), false);
    assert.equal(isValidCoordinate(12.9716, 200), false);
    assert.equal(isValidCoordinate(null, null), false);
});

test("inferAccuracyFromMeta conservatively inflates accuracy when samples are poor", function () {
    const { inferAccuracyFromMeta } = require("../utils/locationVerification");
    // If client claims 5m accuracy, but best in batch was 40m, inferred becomes 40m
    const inferred = inferAccuracyFromMeta(5, {
        bestAccuracy: 40,
        averageAccuracy: 60,
        sampleCount: 10
    });
    assert.ok(inferred >= 40);
});

