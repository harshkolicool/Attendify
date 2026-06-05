const getDistanceInMeters = require("./geoDistance");

const PEER_STALE_MS = Number(process.env.GPS_PEER_STALE_MS || 45000);
const PEER_CLOSE_METERS = Number(process.env.GPS_PEER_CLOSE_METERS || 22);
const PEER_CLUSTER_CLOSE_METERS = Number(process.env.GPS_PEER_CLUSTER_CLOSE_METERS || 28);

function isValidPeerDevice(device) {
    if (!device || device.online === false) {
        return false;
    }

    const lat = Number(device.latitude);
    const lon = Number(device.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return false;
    }

    if (device.lastSeenAt && Date.now() - Number(device.lastSeenAt) > PEER_STALE_MS) {
        return false;
    }

    if (Number(device.accuracy) > 80) {
        return false;
    }

    if (device.gpsCorrected === true || device.gpsCorrected === "true") {
        return false;
    }

    return true;
}

function isInsidePeer(device) {
    if (!device) {
        return false;
    }

    if (device.inside === true) {
        return true;
    }

    const status = String(device.status || "").toUpperCase();

    return status === "INSIDE" || status === "PRESENT_AUTO" || status === "PRESENT_STRONG" || status === "PRESENT_WEAK_GPS" || status === "NEAR";
}

function weightedCentroid(devices) {
    let totalWeight = 0;
    let lat = 0;
    let lon = 0;

    for (let i = 0; i < devices.length; i++) {
        const device = devices[i];
        const accuracy = Math.max(Number(device.accuracy) || 25, 5);
        const weight = 1 / (accuracy * accuracy);

        totalWeight += weight;
        lat += Number(device.latitude) * weight;
        lon += Number(device.longitude) * weight;
    }

    if (!totalWeight) {
        return null;
    }

    return {
        latitude: lat / totalWeight,
        longitude: lon / totalWeight
    };
}

function buildPeerSnapshot(devices, excludeStudentId) {
    const peers = [];

    if (!Array.isArray(devices)) {
        return peers;
    }

    const excludeId = excludeStudentId ? String(excludeStudentId) : "";

    for (let i = 0; i < devices.length; i++) {
        const device = devices[i];

        if (!isValidPeerDevice(device)) {
            continue;
        }

        if (excludeId && String(device.studentId) === excludeId) {
            continue;
        }

        peers.push(device);
    }

    return peers;
}

function analyzePeerContext(studentLat, studentLon, studentAccuracy, peers) {
    const insidePeers = [];

    for (let i = 0; i < peers.length; i++) {
        if (isInsidePeer(peers[i])) {
            insidePeers.push(peers[i]);
        }
    }

    if (!insidePeers.length) {
        return {
            hasInsidePeers: false,
            insidePeerCount: 0,
            nearestInsideDistance: null,
            clusterDistance: null
        };
    }

    let nearestInsideDistance = Infinity;
    let nearestInsidePeer = null;

    for (let i = 0; i < insidePeers.length; i++) {
        const peer = insidePeers[i];
        const d = getDistanceInMeters(
            studentLat,
            studentLon,
            Number(peer.latitude),
            Number(peer.longitude)
        );

        if (d < nearestInsideDistance) {
            nearestInsideDistance = d;
            nearestInsidePeer = peer;
        }
    }

    const cluster = weightedCentroid(insidePeers);
    let clusterDistance = null;

    if (cluster) {
        clusterDistance = getDistanceInMeters(
            studentLat,
            studentLon,
            cluster.latitude,
            cluster.longitude
        );
    }

    return {
        hasInsidePeers: true,
        insidePeerCount: insidePeers.length,
        nearestInsideDistance: Number.isFinite(nearestInsideDistance) ? nearestInsideDistance : null,
        nearestInsidePeer: nearestInsidePeer,
        cluster: cluster,
        clusterDistance: clusterDistance,
        insidePeers: insidePeers
    };
}

function getPeerMatchThreshold(studentAccuracy) {
    const acc = Math.max(Number(studentAccuracy) || 25, 5);

    return Math.max(PEER_CLOSE_METERS, Math.min(40, acc * 0.65));
}

function shouldApplyPeerCalibration(evaluation, peerContext, studentAccuracy) {
    if (!evaluation || !peerContext || !peerContext.hasInsidePeers) {
        return false;
    }

    if (peerContext.insidePeerCount < 2) {
        return false;
    }

    if (!evaluation.isOutside && evaluation.decision === "PASS") {
        return false;
    }

    if (evaluation.shouldRetry) {
        return false;
    }

    const threshold = getPeerMatchThreshold(studentAccuracy);
    const nearNearest =
        peerContext.nearestInsideDistance !== null &&
        peerContext.nearestInsideDistance <= threshold;
    const nearCluster =
        peerContext.clusterDistance !== null &&
        peerContext.clusterDistance <= PEER_CLUSTER_CLOSE_METERS;

    if (nearNearest || nearCluster) {
        return true;
    }

    const measured = Number(evaluation.measuredDistance || 0);
    const verify = Number(evaluation.verificationRadius || evaluation.allowedRadius || 0);
    const combined = Number(evaluation.uncertaintyAllowance || evaluation.combinedAccuracy || 0);
    const acc = Math.max(Number(studentAccuracy) || 25, 10);

    const trulyFar = measured > verify + combined + acc + 180;

    if (trulyFar) {
        return false;
    }

    /*
        Devices on the same desk often report wildly different coordinates.
        If classmates are verified inside, snap ambiguous outliers to the class cluster.
    */
    const ambiguousOutlier =
        measured > verify &&
        peerContext.insidePeerCount >= 1 &&
        acc >= 18 &&
        measured < verify + combined + acc + 150;

    if (ambiguousOutlier) {
        return true;
    }

    if (peerContext.insidePeerCount >= 2 && measured > verify && !trulyFar) {
        return true;
    }

    return false;
}

function getSnapPosition(studentLat, studentLon, peerContext) {
    if (!peerContext || !peerContext.hasInsidePeers) {
        return {
            latitude: studentLat,
            longitude: studentLon
        };
    }

    const nearest = peerContext.nearestInsidePeer;
    const cluster = peerContext.cluster;
    const distNearest = peerContext.nearestInsideDistance || Infinity;

    if (cluster && distNearest > PEER_CLOSE_METERS) {
        return {
            latitude: cluster.latitude,
            longitude: cluster.longitude
        };
    }

    if (nearest && cluster) {
        const distCluster = peerContext.clusterDistance || distNearest;
        const useNearest = distNearest <= distCluster && distNearest <= PEER_CLOSE_METERS;

        if (useNearest) {
            const blend = distNearest < 8 ? 0.82 : 0.6;

            return {
                latitude:
                    Number(nearest.latitude) * blend +
                    Number(studentLat) * (1 - blend),
                longitude:
                    Number(nearest.longitude) * blend +
                    Number(studentLon) * (1 - blend)
            };
        }

        return {
            latitude: cluster.latitude,
            longitude: cluster.longitude
        };
    }

    if (cluster) {
        return {
            latitude: cluster.latitude,
            longitude: cluster.longitude
        };
    }

    if (nearest) {
        return {
            latitude: Number(nearest.latitude),
            longitude: Number(nearest.longitude)
        };
    }

    return {
        latitude: studentLat,
        longitude: studentLon
    };
}

/**
 * When a device is physically with classmates but its GPS fix is an outlier,
 * align evaluation + map position with the in-range peer cluster.
 */
function applyPeerCalibration(
    evaluation,
    centerLat,
    centerLon,
    studentLat,
    studentLon,
    configuredRadius,
    studentAccuracy,
    teacherAccuracy,
    peerDevices,
    excludeStudentId,
    reevaluateFn
) {
    const peers = buildPeerSnapshot(peerDevices, excludeStudentId);
    const peerContext = analyzePeerContext(
        studentLat,
        studentLon,
        studentAccuracy,
        peers
    );

    if (!shouldApplyPeerCalibration(evaluation, peerContext, studentAccuracy)) {
        return {
            evaluation: evaluation,
            displayLatitude: studentLat,
            displayLongitude: studentLon,
            rawLatitude: studentLat,
            rawLongitude: studentLon,
            adjusted: false,
            peerContext: peerContext
        };
    }

    const snap = getSnapPosition(studentLat, studentLon, peerContext);
    let nextEvaluation = evaluation;

    if (typeof reevaluateFn === "function") {
        nextEvaluation = reevaluateFn(snap.latitude, snap.longitude);
    } else {
        nextEvaluation = Object.assign({}, evaluation, {
            isOutside: false,
            shouldRetry: false,
            decision: "PASS",
            status: "INSIDE",
            reasonCode: "OK_COLOCATED",
            isNear: false,
            isInsideByConfidence: true
        });
    }

    nextEvaluation.reasonCode = "OK_COLOCATED";
    nextEvaluation.gpsCorrected = true;
    nextEvaluation.rawMeasuredDistance = evaluation.measuredDistance;
    nextEvaluation.peerNearestMeters = Math.round(peerContext.nearestInsideDistance || 0);
    nextEvaluation.peerInsideCount = peerContext.insidePeerCount;

    return {
        evaluation: nextEvaluation,
        displayLatitude: snap.latitude,
        displayLongitude: snap.longitude,
        rawLatitude: studentLat,
        rawLongitude: studentLon,
        adjusted: true,
        peerContext: peerContext
    };
}

module.exports = {
    buildPeerSnapshot,
    analyzePeerContext,
    applyPeerCalibration,
    getPeerMatchThreshold,
    PEER_CLOSE_METERS,
    PEER_CLUSTER_CLOSE_METERS
};
