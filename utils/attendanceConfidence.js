/**
 * Attendance Confidence Score Calculator
 *
 * Produces a 0–100 integer score representing how confident we are
 * that the student is genuinely present in the classroom.
 *
 * Breakdown (total = 100):
 *   Distance from teacher:   30 points
 *   GPS accuracy:            20 points
 *   Fresh live update:       15 points
 *   Recent snapshot:         15 points
 *   Token/device valid:      15 points
 *   Movement sanity:          5 points
 */

function calculateAttendanceConfidence({
    distance,
    radius,
    accuracy,
    locationAgeMs,
    hasRecentLiveSnapshot,
    tokenValid,
    browserFingerprintValid,
    suspicious
}) {
    let score = 0;

    if (Number.isFinite(distance) && Number.isFinite(radius) && radius > 0) {
        if (distance <= radius) {
            score += 30;
        } else if (
            Number.isFinite(accuracy) &&
            distance <= radius + Math.min(accuracy, 100)
        ) {
            score += 18;
        }
    }

    if (Number.isFinite(accuracy) && accuracy > 0) {
        if (accuracy <= 30) score += 20;
        else if (accuracy <= 50) score += 16;
        else if (accuracy <= 100) score += 10;
        else if (accuracy <= 200) score += 6;
        else if (accuracy <= 300) score += 3;
    }

    if (Number.isFinite(locationAgeMs) && locationAgeMs >= 0) {
        if (locationAgeMs <= 10000) score += 15;
        else if (locationAgeMs <= 20000) score += 8;
    }

    if (hasRecentLiveSnapshot) {
        score += 15;
    }

    if (tokenValid || browserFingerprintValid) {
        score += 15;
    }

    if (!suspicious) {
        score += 5;
    }

    return Math.max(0, Math.min(100, score));
}

function scoreToDecision(score) {
    if (score >= 85) return "PRESENT_STRONG";
    if (score >= 50) return "PRESENT_WEAK_GPS";
    return "REJECT_OR_RETRY";
}

module.exports = {
    calculateAttendanceConfidence,
    scoreToDecision
};
