const getDistanceInMeters = require("./geoDistance");

function isValidCoordinate(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180 &&
        (lat !== 0 || lon !== 0)
    );
}

function isFreshTimestamp(timestamp, maxAgeMs) {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts <= maxAgeMs;
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
    if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
        return Infinity;
    }
    return getDistanceInMeters(lat1, lng1, lat2, lng2);
}

function isRejectedSource(locationMeta) {
    if (!locationMeta || !locationMeta.source) return false;
    const source = String(locationMeta.source).toLowerCase();
    const rejected = [
        "mock-dev",
        "ip-fallback-primary",
        "ip-fallback-secondary",
        "ultimate-failsafe",
        "ip-location",
        "fallback-location"
    ];
    return rejected.includes(source);
}

function verifyStudentAttendanceLocation({
    session,
    student,
    latitude,
    longitude,
    accuracy,
    timestamp,
    attendanceTokenValid,
    browserFingerprintValid,
    recentLiveSnapshot,
    gpsUnavailable,
    locationMeta
}) {
    const allowedRadius = Number(session.radius);
    
    // Check if the current provided location is completely missing or unusable
    let hasUsableCurrentGps = !gpsUnavailable && isValidCoordinate(latitude, longitude) && !isRejectedSource(locationMeta);

    // Decision C: Use Recent Live Snapshot if current GPS is missing/weak
    let activeLat = latitude;
    let activeLon = longitude;
    let activeAcc = accuracy;
    let activeTs = timestamp;
    let activeMeta = locationMeta;
    let snapshotUsed = false;

    if (!hasUsableCurrentGps && recentLiveSnapshot) {
        if (
            recentLiveSnapshot.student.toString() === student._id.toString() &&
            isValidCoordinate(recentLiveSnapshot.latitude, recentLiveSnapshot.longitude) &&
            !isRejectedSource(recentLiveSnapshot.locationMeta) &&
            isFreshTimestamp(new Date(recentLiveSnapshot.lastSeenAt).getTime(), 30000)
        ) {
            activeLat = recentLiveSnapshot.latitude;
            activeLon = recentLiveSnapshot.longitude;
            activeAcc = recentLiveSnapshot.accuracy;
            activeTs = new Date(recentLiveSnapshot.lastSeenAt).getTime();
            activeMeta = recentLiveSnapshot.locationMeta;
            snapshotUsed = true;
            hasUsableCurrentGps = true;
        }
    }

    // Decision E: GPS_RETRY_REQUIRED
    if (!hasUsableCurrentGps || !isFreshTimestamp(activeTs, 30000) || Number(activeAcc) > 300) {
        return {
            decision: "GPS_RETRY_REQUIRED",
            attendanceStatus: "GPS_RETRY_REQUIRED",
            verificationMethod: "NONE",
            distanceFromTeacher: Infinity,
            allowedRadius: allowedRadius,
            finalAccuracy: activeAcc,
            confidenceScore: 0,
            reasonCode: "NO_USABLE_GPS",
            reasonMessage: "GPS is not accurate enough. Please keep Location, Wi-Fi, and mobile data on, stay in class, and try again.",
            shouldMarkPresent: false,
            shouldReject: false,
            shouldRetryGps: true,
            recentLiveSnapshotUsed: snapshotUsed
        };
    }

    const distanceFromTeacher = calculateDistanceMeters(
        activeLat,
        activeLon,
        session.latitude,
        session.longitude
    );

    const safeAccuracy = Number.isFinite(Number(activeAcc)) ? Number(activeAcc) : 100;
    const allowedDistanceWithPadding = allowedRadius + Math.min(safeAccuracy, 100);

    // Decision A: STRONG GPS PRESENT
    if (activeAcc <= 50 && distanceFromTeacher <= allowedRadius && isFreshTimestamp(activeTs, 20000)) {
        return {
            decision: "PRESENT_STRONG",
            attendanceStatus: "PRESENT",
            verificationMethod: "AUTO_GPS",
            distanceFromTeacher: distanceFromTeacher,
            allowedRadius: allowedRadius,
            finalAccuracy: activeAcc,
            confidenceScore: 90, // We could call calculateAttendanceConfidence here
            reasonCode: "STRONG_GPS_INSIDE",
            reasonMessage: "Attendance marked successfully.",
            shouldMarkPresent: true,
            shouldReject: false,
            shouldRetryGps: false,
            recentLiveSnapshotUsed: snapshotUsed
        };
    }

    // Decision B: WEAK GPS PRESENT
    if (activeAcc <= 300 && distanceFromTeacher <= allowedDistanceWithPadding && isFreshTimestamp(activeTs, 20000)) {
        return {
            decision: "PRESENT_WEAK_GPS",
            attendanceStatus: "PRESENT",
            verificationMethod: "GPS_WEAK_AUTO",
            distanceFromTeacher: distanceFromTeacher,
            allowedRadius: allowedRadius,
            finalAccuracy: activeAcc,
            confidenceScore: 65,
            reasonCode: "WEAK_GPS_INSIDE",
            reasonMessage: "Attendance marked successfully. GPS accuracy was weak, but you were within the allowed range.",
            shouldMarkPresent: true,
            shouldReject: false,
            shouldRetryGps: false,
            recentLiveSnapshotUsed: snapshotUsed
        };
    }

    // Decision D: OUTSIDE_REJECTED
    return {
        decision: "OUTSIDE_REJECTED",
        attendanceStatus: "OUTSIDE_REJECTED",
        verificationMethod: "AUTO_GPS_REJECTED",
        distanceFromTeacher: distanceFromTeacher,
        allowedRadius: allowedRadius,
        finalAccuracy: activeAcc,
        confidenceScore: 0,
        reasonCode: "CLEARLY_OUTSIDE",
        reasonMessage: "You appear to be outside the attendance range.",
        shouldMarkPresent: false,
        shouldReject: true,
        shouldRetryGps: false,
        recentLiveSnapshotUsed: snapshotUsed
    };
}

module.exports = {
    isValidCoordinate,
    isFreshTimestamp,
    calculateDistanceMeters,
    verifyStudentAttendanceLocation
};
