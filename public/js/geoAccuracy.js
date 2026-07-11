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

    var kalmanFilter = null;

    function handleSuccess(position) {
        var coords = position.coords;
        var ts = position.timestamp || Date.now();

        if (!isValid(coords.latitude, coords.longitude, coords.accuracy)) {
            return null;
        }

        var lat = coords.latitude;
        var lon = coords.longitude;
        var source = "browser-watch";

        if (typeof window !== "undefined" && window.KalmanFilter) {
            if (!kalmanFilter) {
                kalmanFilter = new window.KalmanFilter();
            }
            var filtered = kalmanFilter.filter(lat, lon, coords.accuracy, ts);
            lat = filtered.lat;
            lon = filtered.lon;
            source = "kalman-filtered-watch";
        }

        var sample = {
            latitude: lat,
            longitude: lon,
            accuracy: coords.accuracy,
            timestamp: ts,
            source: source
        };

        state.cachedPosition = sample;
        state.recentSamples.push(sample);

        if (state.recentSamples.length > CACHE_SIZE) {
            state.recentSamples.shift();
        }
        
        return sample;
    }

    function handleError(error) {
        console.warn("AttendifyLiveStream GPS Error:", error.message);
    }

    var AttendifyLiveStream = {
        subscribers: [],
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
                function(position) {
                    var sample = handleSuccess(position);
                    if (sample) {
                        AttendifyLiveStream.push({
                            coords: {
                                latitude: sample.latitude,
                                longitude: sample.longitude,
                                accuracy: sample.accuracy
                            },
                            timestamp: sample.timestamp
                        });
                    }
                },
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
        },

        subscribe: function(callback) {
            this.subscribers.push(callback);
            if (state.cachedPosition) {
                callback({
                    coords: state.cachedPosition,
                    timestamp: state.cachedPosition.timestamp
                });
            }
            var self = this;
            return function() {
                var idx = self.subscribers.indexOf(callback);
                if (idx > -1) self.subscribers.splice(idx, 1);
            };
        },

        push: function(position) {
            this.subscribers.forEach(function(cb) { cb(position); });
        }
    };

    root.AttendifyLiveStream = AttendifyLiveStream;

})(typeof window !== "undefined" ? window : this);
