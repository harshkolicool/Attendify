const getDistanceInMeters = require("./geoDistance");

const MAX_GPS_ACCURACY_METERS = Number(
    process.env.GPS_MAX_ACCEPTABLE_ACCURACY_METERS ||
        process.env.GPS_HARD_BLOCK_ACCURACY_METERS ||
        1000
);

const MAX_GPS_UNCERTAINTY_ALLOWANCE = Number(process.env.GPS_UNCERTAINTY_CAP_METERS || 100);

const SMALL_RADIUS_THRESHOLD = Number(process.env.GPS_SMALL_RADIUS_PRACTICAL_THRESHOLD || 25);
const SMALL_RADIUS_GRACE = Number(process.env.GPS_SMALL_RADIUS_GRACE_METERS || 10);
const NEAR_BOUNDARY_RATIO = Number(process.env.GPS_NEAR_BOUNDARY_RATIO || 0.7);

const GPS_RETRY_EXTREME_METERS = Number(process.env.GPS_RETRY_EXTREME_METERS || 1000);
const GPS_RETRY_POOR_METERS = Number(process.env.GPS_RETRY_POOR_METERS || 500);
const GPS_WEAK_THRESHOLD_METERS = Number(process.env.GPS_WEAK_THRESHOLD_METERS || 300);

const PROXIMITY_BOOST_MAX_METERS = Number(process.env.GPS_PROXIMITY_BOOST_MAX_METERS || 40);

const WEAK_GPS_USER_MESSAGE =
    "GPS accuracy is weak. Please turn on precise location, move near a window, wait a few seconds, and try again.";

const GPS_DEBUG =
    process.env.GPS_DEBUG === "1" ||
    process.env.GPS_DEBUG === "true" ||
    process.env.NODE_ENV === "development";

function normalizeGpsAccuracy(accuracy) {
    const num = Number(accuracy);

    if (!Number.isFinite(num) || num < 0) {
        return 0;
    }

    return num;
}

function isValidCoordinate(lat, lon) {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180
    );
}

function isUsableAccuracy(accuracy) {
    const acc = Number(accuracy);
    return Number.isFinite(acc) && acc > 0 && acc <= MAX_GPS_ACCURACY_METERS;
}

function clampAccuracyAllowance(studentAccuracy, teacherAccuracy) {
    return Math.min(
        normalizeGpsAccuracy(studentAccuracy) + normalizeGpsAccuracy(teacherAccuracy),
        MAX_GPS_UNCERTAINTY_ALLOWANCE
    );
}

function inferAccuracyFromMeta(reportedAccuracy, locationMeta) {
    let inferred = normalizeGpsAccuracy(reportedAccuracy);

    if (!locationMeta || typeof locationMeta !== "object") {
        return inferred;
    }

    const averageAccuracy = normalizeGpsAccuracy(locationMeta.averageAccuracy);
    const bestAccuracy = normalizeGpsAccuracy(locationMeta.bestAccuracy);
    const sampleCount = Number(locationMeta.sampleCount) || 0;

    if (averageAccuracy > inferred) {
        inferred = Math.max(inferred, Math.round(averageAccuracy * 0.9));
    }

    if (bestAccuracy > 0 && bestAccuracy < inferred) {
        inferred = Math.max(inferred, bestAccuracy);
    }

    if (sampleCount > 0 && sampleCount < 4 && inferred > 0 && inferred < 40) {
        inferred = Math.max(inferred, 35);
    }

    return inferred;
}

/**
 * Admin-configured classroom radius (dynamic per classroom) — never overridden.
 */
function getAdminRadiusPolicy(adminRadiusMeters) {
    const adminConfiguredRadius = Math.max(1, Number(adminRadiusMeters) || 100);

    let graceMeters = 0;

    if (adminConfiguredRadius < SMALL_RADIUS_THRESHOLD) {
        graceMeters = Math.max(
            SMALL_RADIUS_GRACE,
            Math.ceil(adminConfiguredRadius * 3)
        );
    }

    return {
        adminConfiguredRadius: adminConfiguredRadius,
        adminRadiusWithGrace: adminConfiguredRadius + graceMeters,
        graceMeters: graceMeters
    };
}

/**
 * GPS cannot verify positions tighter than combined device accuracy.
 * verificationRadius = max(admin grace radius, combined GPS uncertainty cap).
 */
function computeVerificationRadius(adminRadiusMeters, studentAccuracy, teacherAccuracy) {
    const policy = getAdminRadiusPolicy(adminRadiusMeters);
    const combinedAccuracy = clampAccuracyAllowance(studentAccuracy, teacherAccuracy);

    const verificationRadius = Math.max(policy.adminRadiusWithGrace, combinedAccuracy);

    return {
        adminConfiguredRadius: policy.adminConfiguredRadius,
        adminRadiusWithGrace: policy.adminRadiusWithGrace,
        graceMeters: policy.graceMeters,
        combinedAccuracy: combinedAccuracy,
        verificationRadius: verificationRadius
    };
}

function applyProximityAccuracyBoost(distanceMeters, cappedCombinedAccuracy, studentAccuracy, teacherAccuracy) {
    if (distanceMeters > PROXIMITY_BOOST_MAX_METERS) {
        return cappedCombinedAccuracy;
    }

    const proximityFloor = Math.min(
        MAX_GPS_UNCERTAINTY_ALLOWANCE,
        distanceMeters + Math.max(normalizeGpsAccuracy(studentAccuracy), normalizeGpsAccuracy(teacherAccuracy))
    );

    return Math.max(cappedCombinedAccuracy, Math.round(proximityFloor));
}

function formatDistance(meters) {
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) {
        return "Unknown";
    }

    if (meters < 1000) {
        return Math.round(meters) + " m away";
    }

    return (meters / 1000).toFixed(1) + " km away";
}

function logGpsDecision(context, payload) {
    if (!GPS_DEBUG) {
        return;
    }

    console.log("[GPS]", context || "evaluation", JSON.stringify(payload, null, 2));
}

function evaluateLocationRange(
    teacherLat,
    teacherLon,
    studentLat,
    studentLon,
    configuredRadiusMeters,
    studentAccuracyMeters,
    teacherAccuracyMeters,
    options
) {
    const opts = options || {};

    const rawDistance = getDistanceInMeters(teacherLat, teacherLon, studentLat, studentLon);
    const distanceMeters = Math.round(rawDistance);

    const sAcc = inferAccuracyFromMeta(
        studentAccuracyMeters,
        opts.studentLocationMeta || null
    );
    const tAcc = inferAccuracyFromMeta(
        teacherAccuracyMeters,
        opts.teacherLocationMeta || null
    );

    const radiusInfo = computeVerificationRadius(configuredRadiusMeters, sAcc, tAcc);
    let cappedCombinedAccuracy = applyProximityAccuracyBoost(
        distanceMeters,
        radiusInfo.combinedAccuracy,
        sAcc,
        tAcc
    );

    const adminConfiguredRadius = radiusInfo.adminConfiguredRadius;
    const verificationRadius = Math.max(radiusInfo.verificationRadius, cappedCombinedAccuracy);

    const minimumPossibleDistance = Math.max(0, distanceMeters - cappedCombinedAccuracy);
    const clearlyOutside = distanceMeters > verificationRadius + cappedCombinedAccuracy;
    const isInsideByConfidence = minimumPossibleDistance <= verificationRadius;
    const isInsideAdminTarget = distanceMeters <= adminConfiguredRadius + radiusInfo.graceMeters;

    const isAccuracyExtreme = sAcc > GPS_RETRY_EXTREME_METERS || tAcc > GPS_RETRY_EXTREME_METERS;
    const isAccuracyPoor = sAcc > GPS_RETRY_POOR_METERS;
    const isAccuracyWeak = sAcc >= GPS_WEAK_THRESHOLD_METERS || tAcc >= GPS_WEAK_THRESHOLD_METERS;

    let decision = "PASS";
    let reasonCode = "OK";
    let userMessage = "Inside allowed range. Attendance accepted.";
    let shouldRetry = false;
    let isOutside = false;

    // PRIORITY 1: If student is clearly inside the allowed radius (even with poor
    // accuracy), accept them. This is critical for laptops/Macs that use Wi-Fi
    // geolocation and inherently report 500-1000m accuracy but are physically
    // sitting in the classroom.
    if (isInsideByConfidence) {
        decision = "PASS";
        reasonCode = (isAccuracyWeak || isAccuracyPoor) ? "OK_POOR_GPS" : "OK";
        userMessage = (isAccuracyWeak || isAccuracyPoor)
            ? "GPS accuracy is low but you appear to be within range. Attendance accepted."
            : "Inside allowed range. Attendance accepted.";
    } else if (clearlyOutside || minimumPossibleDistance > verificationRadius) {
        // PRIORITY 2: Student is clearly outside — reject regardless of accuracy.
        decision = "FAIL";
        reasonCode = clearlyOutside ? "CLEARLY_OUTSIDE" : "OUTSIDE_RADIUS";
        isOutside = true;
        userMessage = getLocationDecisionMessage({
            isOutside: true,
            measuredDistance: distanceMeters,
            minimumPossibleDistance: minimumPossibleDistance,
            allowedRadius: verificationRadius,
            adminConfiguredRadius: adminConfiguredRadius,
            uncertaintyAllowance: cappedCombinedAccuracy,
            studentAccuracy: sAcc,
            teacherAccuracy: tAcc
        });
    } else if (isAccuracyExtreme) {
        // PRIORITY 3: Ambiguous position + extremely bad accuracy → retry
        decision = "RETRY";
        reasonCode = "GPS_ACCURACY_EXTREME";
        shouldRetry = true;
        userMessage = WEAK_GPS_USER_MESSAGE;
    } else if (isAccuracyPoor || isAccuracyWeak) {
        // PRIORITY 4: Ambiguous position + poor/weak accuracy → retry
        decision = "RETRY";
        reasonCode = isAccuracyPoor ? "GPS_ACCURACY_POOR" : "GPS_ACCURACY_WEAK";
        shouldRetry = true;
        userMessage = WEAK_GPS_USER_MESSAGE;
    } else {
        decision = "RETRY";
        reasonCode = "GPS_UNCERTAIN";
        shouldRetry = true;
        userMessage = WEAK_GPS_USER_MESSAGE;
    }

    const couldBeAtZero = minimumPossibleDistance === 0;
    const isNear =
        !isOutside &&
        !shouldRetry &&
        isInsideByConfidence &&
        !isInsideAdminTarget &&
        distanceMeters > adminConfiguredRadius * NEAR_BOUNDARY_RATIO;

    let status;

    if (isOutside) {
        status = "OUTSIDE";
    } else if (shouldRetry) {
        status = "RETRY";
    } else if (isNear) {
        status = "NEAR";
    } else {
        status = "INSIDE";
    }

    const evaluation = {
        measuredDistance: distanceMeters,
        minimumPossibleDistance: minimumPossibleDistance,
        configuredRadius: adminConfiguredRadius,
        adminConfiguredRadius: adminConfiguredRadius,
        allowedRadius: verificationRadius,
        effectiveRadius: verificationRadius,
        verificationRadius: verificationRadius,
        uncertaintyAllowance: cappedCombinedAccuracy,
        combinedAccuracy: cappedCombinedAccuracy,
        studentAccuracy: sAcc,
        teacherAccuracy: tAcc,
        clearlyOutside: clearlyOutside,
        isInsideByConfidence: isInsideByConfidence,
        isInsideAdminTarget: isInsideAdminTarget,
        isOutside: isOutside,
        isAccuracyPoor: isAccuracyPoor,
        isAccuracyWeak: isAccuracyWeak,
        isAccuracyExtreme: isAccuracyExtreme,
        shouldRetry: shouldRetry,
        decision: decision,
        reasonCode: reasonCode,
        userMessage: userMessage,
        isNear: isNear,
        status: status,
        distanceLabel: formatDistance(distanceMeters),
        gpsNote:
            adminConfiguredRadius < SMALL_RADIUS_THRESHOLD
                ? "Admin radius is very small; GPS verification uses a larger uncertainty zone."
                : ""
    };

    logGpsDecision(opts.logContext || "evaluateLocationRange", {
        teacherLatitude: teacherLat,
        teacherLongitude: teacherLon,
        studentLatitude: studentLat,
        studentLongitude: studentLon,
        teacherAccuracy: tAcc,
        studentAccuracy: sAcc,
        measuredDistance: distanceMeters,
        combinedAccuracy: cappedCombinedAccuracy,
        minimumPossibleDistance: minimumPossibleDistance,
        adminConfiguredRadius: adminConfiguredRadius,
        verificationRadius: verificationRadius,
        clearlyOutside: clearlyOutside,
        decision: decision,
        reasonCode: reasonCode
    });

    return evaluation;
}

function getLocationDecisionMessage(evaluation) {
    if (!evaluation) {
        return "Location could not be evaluated.";
    }

    if (evaluation.isOutside) {
        return (
            "You appear to be outside the allowed attendance area. " +
            "Measured distance: " +
            evaluation.measuredDistance +
            " m. " +
            "Best-case distance after GPS uncertainty: " +
            evaluation.minimumPossibleDistance +
            " m. " +
            "Allowed verification radius: " +
            Math.round(evaluation.verificationRadius || evaluation.effectiveRadius || 0) +
            " m (admin target: " +
            Math.round(evaluation.adminConfiguredRadius || evaluation.configuredRadius || 0) +
            " m)."
        );
    }

    if (evaluation.isNear) {
        return (
            "You are near the admin classroom boundary but within GPS verification range. Attendance accepted."
        );
    }

    if (evaluation.isAccuracyPoor || evaluation.isAccuracyWeak) {
        return WEAK_GPS_USER_MESSAGE;
    }

    return "Inside allowed range. Attendance accepted.";
}

function shouldEmitSuspiciousAttempt(reasonCode) {
    return reasonCode === "OUTSIDE_RADIUS" || reasonCode === "CLEARLY_OUTSIDE";
}

function getWeakGpsUserMessage() {
    return WEAK_GPS_USER_MESSAGE;
}

function getRecommendedCollectionMs(adminRadiusMeters) {
    const admin = Math.max(1, Number(adminRadiusMeters) || 100);

    if (admin <= 5) {
        return 20000;
    }

    if (admin < SMALL_RADIUS_THRESHOLD) {
        return 15000;
    }

    return 10000;
}

module.exports = {
    getDistanceInMeters,
    normalizeGpsAccuracy,
    inferAccuracyFromMeta,
    formatDistance,
    evaluateLocationRange,
    getAdminRadiusPolicy,
    computeVerificationRadius,
    getLocationDecisionMessage,
    shouldEmitSuspiciousAttempt,
    getWeakGpsUserMessage,
    getRecommendedCollectionMs,
    logGpsDecision,
    isValidCoordinate,
    isUsableAccuracy,
    clampAccuracyAllowance,
    MAX_GPS_ACCURACY_METERS,
    MAX_GPS_UNCERTAINTY_ALLOWANCE_METERS: MAX_GPS_UNCERTAINTY_ALLOWANCE,
    SMALL_RADIUS_THRESHOLD_METERS: SMALL_RADIUS_THRESHOLD,
    SMALL_RADIUS_GRACE_METERS: SMALL_RADIUS_GRACE,
    NEAR_BOUNDARY_RATIO,
    GPS_RETRY_EXTREME_METERS,
    GPS_RETRY_POOR_METERS,
    GPS_WEAK_THRESHOLD_METERS,
    WEAK_GPS_USER_MESSAGE
};
