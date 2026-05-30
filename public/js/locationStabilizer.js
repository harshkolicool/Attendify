/**
 * Stabilizes noisy GPS coordinates so stationary devices do not drift on the map.
 */
(function (root) {
    "use strict";

    function distanceM(lat1, lon1, lat2, lon2) {
        const r = 6371000;
        const p1 = (lat1 * Math.PI) / 180;
        const p2 = (lat2 * Math.PI) / 180;
        const dp = ((lat2 - lat1) * Math.PI) / 180;
        const dl = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);

        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function createStabilizer(options) {
        const opts = options || {};
        const minMoveMeters = Number(opts.minMoveMeters) || 4;
        const accuracyRatio = Number(opts.accuracyRatio) || 0.35;
        const heartbeatMs = Number(opts.heartbeatMs) || 28000;

        let displayLat = null;
        let displayLon = null;
        let lastHeartbeatAt = 0;
        let kalman = typeof window.KalmanFilter === "function" ? new window.KalmanFilter() : null;

        return {
            reset: function () {
                displayLat = null;
                displayLon = null;
                lastHeartbeatAt = 0;
                if (kalman) kalman = new window.KalmanFilter();
            },

            update: function (latitude, longitude, accuracy) {
                const lat = Number(latitude);
                const lon = Number(longitude);
                const acc = Number(accuracy);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return {
                        lat: displayLat,
                        lon: displayLon,
                        moved: false,
                        skipped: true
                    };
                }

                const safeAcc = Number.isFinite(acc) && acc > 0 ? acc : 25;
                const now = Date.now();

                let filteredLat = lat;
                let filteredLon = lon;

                if (kalman) {
                    const result = kalman.filter(lat, lon, safeAcc, now);
                    filteredLat = result.lat;
                    filteredLon = result.lon;
                }

                if (displayLat === null || displayLon === null) {
                    displayLat = filteredLat;
                    displayLon = filteredLon;
                    lastHeartbeatAt = now;

                    return {
                        lat: displayLat,
                        lon: displayLon,
                        moved: true,
                        isFirst: true
                    };
                }

                const deltaToTarget = distanceM(displayLat, displayLon, filteredLat, filteredLon);
                const threshold = Math.max(minMoveMeters, safeAcc * accuracyRatio);
                const heartbeatDue = now - lastHeartbeatAt >= heartbeatMs;

                if (deltaToTarget < threshold && !heartbeatDue) {
                    return {
                        lat: displayLat,
                        lon: displayLon,
                        moved: false,
                        jitterMeters: Math.round(deltaToTarget * 10) / 10
                    };
                }

                const step = deltaToTarget > threshold * 2.5 ? 0.4 : 0.2; // EMA alpha

                displayLat = displayLat + (filteredLat - displayLat) * step;
                displayLon = displayLon + (filteredLon - displayLon) * step;
                lastHeartbeatAt = now;

                return {
                    lat: displayLat,
                    lon: displayLon,
                    moved: true,
                    jitterMeters: Math.round(deltaToTarget * 10) / 10
                };
            }
        };
    }

    root.AttendifyLocationStabilizer = {
        create: createStabilizer,
        distanceM: distanceM
    };
})(window);
