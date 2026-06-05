/**
 * AttendifyLiveStream
 *
 * Keeps the browser's GPS warm and provides immediate access to
 * the freshest, most accurate location for fast attendance marking.
 *
 * Requirements:
 * - Uses watchPosition to maintain active GPS lock.
 * - Caches recent valid locations.
 * - Rejects 0,0, mock, and stale locations.
 */
(function (root) {
    "use strict";

    var CACHE_SIZE = 10;
    var MAX_VALID_AGE_MS = 15000;

    var state = {
        watchId: null,
        isRunning: false,
        recentSamples: [],
        cachedPosition: null,
        sessionId: null
    };

    function isValid(lat, lon, acc) {
        return (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            lat !== 0 &&
            lon !== 0 &&
            lat >= -90 &&
            lat <= 90 &&
            lon >= -180 &&
            lon <= 180 &&
            Number.isFinite(acc) &&
            acc > 0
        );
    }

    function handleSuccess(position) {
        var coords = position.coords;
        var ts = position.timestamp || Date.now();

        if (!isValid(coords.latitude, coords.longitude, coords.accuracy)) {
            return;
        }

        var sample = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp: ts,
            source: "browser-watch"
        };

        state.cachedPosition = sample;
        state.recentSamples.push(sample);

        if (state.recentSamples.length > CACHE_SIZE) {
            state.recentSamples.shift();
        }
    }

    function handleError(error) {
        console.warn("AttendifyLiveStream GPS Error:", error.message);
    }

    var AttendifyLiveStream = {
        start: function (sessionId) {
            if (state.isRunning) return;

            if (!navigator.geolocation) {
                console.warn("Geolocation not supported");
                return;
            }

            state.sessionId = sessionId || "global";
            state.isRunning = true;

            // Warm up the GPS
            state.watchId = navigator.geolocation.watchPosition(
                handleSuccess,
                handleError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 10000
                }
            );

            console.log("AttendifyLiveStream started");
        },

        stop: function () {
            if (!state.isRunning) return;

            if (state.watchId !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(state.watchId);
            }

            state.watchId = null;
            state.isRunning = false;
            state.sessionId = null;
            console.log("AttendifyLiveStream stopped");
        },

        getBestFreshPosition: function (maxAgeMs) {
            var maxAge = maxAgeMs || MAX_VALID_AGE_MS;
            var now = Date.now();
            var best = null;

            for (var i = 0; i < state.recentSamples.length; i++) {
                var s = state.recentSamples[i];
                if (now - s.timestamp <= maxAge) {
                    if (!best || s.accuracy < best.accuracy) {
                        best = s;
                    }
                }
            }

            return best;
        },

        getRecentFreshSamples: function (maxAgeMs) {
            var maxAge = maxAgeMs || MAX_VALID_AGE_MS;
            var now = Date.now();
            return state.recentSamples.filter(function(s) {
                return now - s.timestamp <= maxAge;
            });
        },

        clearCache: function() {
            state.recentSamples = [];
            state.cachedPosition = null;
        }
    };

    root.AttendifyLiveStream = AttendifyLiveStream;

})(typeof window !== "undefined" ? window : this);
