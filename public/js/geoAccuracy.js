/**
 * AttendifyGeo — multi-sample high-accuracy geolocation for attendance.
 *
 * Collects readings for 10–20 seconds, rejects outliers, returns a stable fix
 * with accuracy metadata for server-side uncertainty handling.
 */
(function (root) {
    "use strict";

    var TARGET_ACCURACY_M = 10;
    var ACCEPTABLE_ACCURACY_M = 15;
    var MAX_ACCURACY_ALLOWED_M = 1500;
    var MIN_SAMPLES = 8;
    var MAX_SAMPLES = 24;
    var MIN_COLLECTION_MS = 15000;
    var MAX_WAIT_MS = 25000;
    var OUTLIER_SIGMA = 2.5;
    var MAX_SPEED_KMH = 100;

    function distanceM(lat1, lon1, lat2, lon2) {
        var R = 6371000;
        var φ1 = (lat1 * Math.PI) / 180;
        var φ2 = (lat2 * Math.PI) / 180;
        var Δφ = ((lat2 - lat1) * Math.PI) / 180;
        var Δλ = ((lon2 - lon1) * Math.PI) / 180;
        var a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function isValidCoords(lat, lon, acc) {
        return (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            lat >= -90 &&
            lat <= 90 &&
            lon >= -180 &&
            lon <= 180 &&
            Number.isFinite(acc) &&
            acc > 0
        );
    }

    function weightedCentroid(positions) {
        if (!positions || positions.length === 0) {
            return null;
        }

        var totalWeight = 0;
        var wLat = 0;
        var wLon = 0;

        for (var i = 0; i < positions.length; i++) {
            var c = positions[i].coords;
            var acc = Math.max(c.accuracy, 1);
            var w = 1 / (acc * acc);
            totalWeight += w;
            wLat += c.latitude * w;
            wLon += c.longitude * w;
        }

        var lat = wLat / totalWeight;
        var lon = wLon / totalWeight;
        var wAcc = 0;

        for (var j = 0; j < positions.length; j++) {
            var c2 = positions[j].coords;
            var acc2 = Math.max(c2.accuracy, 1);
            var w2 = 1 / (acc2 * acc2);
            wAcc += acc2 * acc2 * w2;
        }

        return {
            lat: lat,
            lon: lon,
            accuracy: Math.sqrt(wAcc / totalWeight)
        };
    }

    function nearestSampleToCentroid(positions, centroid) {
        var best = null;
        var bestScore = Infinity;

        for (var i = 0; i < positions.length; i++) {
            var c = positions[i].coords;
            var d = distanceM(c.latitude, c.longitude, centroid.lat, centroid.lon);
            var score = d + c.accuracy * 0.5;

            if (score < bestScore) {
                bestScore = score;
                best = positions[i];
            }
        }

        return best;
    }

    function rejectOutliers(positions, centroid, bestAcc) {
        var threshold = Math.max(bestAcc * OUTLIER_SIGMA, 30);
        var now = Date.now();

        return positions.filter(function (pos, index) {
            var sampleAgeMs = now - pos.timestamp;
            if (sampleAgeMs > 30000) {
                return false;
            }

            var c = pos.coords;
            var d = distanceM(c.latitude, c.longitude, centroid.lat, centroid.lon);
            if (d > threshold) {
                return false;
            }

            if (index > 0) {
                var prev = positions[index - 1];
                var timeDiffSec = Math.max((pos.timestamp - prev.timestamp) / 1000, 1);
                var distM = distanceM(
                    c.latitude,
                    c.longitude,
                    prev.coords.latitude,
                    prev.coords.longitude
                );
                var speedKmh = (distM / timeDiffSec) * 3.6;
                if (speedKmh > MAX_SPEED_KMH) {
                    return false;
                }
            }

            return true;
        });
    }

    function getBestPosition(onProgress, options) {
        options = options || {};

        var minCollectionMs = Number(options.minCollectionMs) || MIN_COLLECTION_MS;
        var maxWaitMs = Number(options.maxWaitMs) || MAX_WAIT_MS;

        return new Promise(function (resolve, reject) {
            var rawSamples = [];
            var finished = false;
            var watchId = null;
            var timeoutId = null;
            var startTime = Date.now();

            function cleanup() {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (watchId !== null && navigator.geolocation) {
                    try {
                        navigator.geolocation.clearWatch(watchId);
                    } catch (e) {
                        // ignore
                    }
                }
            }

            function elapsedMs() {
                return Date.now() - startTime;
            }

            function minCollectionReached() {
                return elapsedMs() >= minCollectionMs;
            }

            function getBestRaw() {
                if (rawSamples.length === 0) {
                    return null;
                }

                return rawSamples.reduce(function (best, cur) {
                    return cur.coords.accuracy < best.coords.accuracy ? cur : best;
                });
            }

            function done(error) {
                if (finished) {
                    return;
                }

                finished = true;
                cleanup();

                if (rawSamples.length === 0) {
                    reject(error || new Error("Location unavailable."));
                    return;
                }

                var centroid = weightedCentroid(rawSamples);
                var best0 = getBestRaw();
                var filtered = rejectOutliers(rawSamples, centroid, best0.coords.accuracy);
                var finalSamples = filtered.length >= 2 ? filtered : rawSamples;
                
                var finalCentroid = weightedCentroid(finalSamples);
                
                if (typeof window.KalmanFilter === "function") {
                    var kf = new window.KalmanFilter();
                    var lastFiltered = null;
                    for (var i = 0; i < finalSamples.length; i++) {
                        var s = finalSamples[i];
                        lastFiltered = kf.filter(s.coords.latitude, s.coords.longitude, s.coords.accuracy, s.timestamp);
                    }
                    if (lastFiltered) {
                        finalCentroid.lat = lastFiltered.lat;
                        finalCentroid.lon = lastFiltered.lon;
                    }
                }

                var resultSample = nearestSampleToCentroid(finalSamples, finalCentroid);

                var avgAcc = 0;
                if (rawSamples.length > 0) {
                    avgAcc =
                        rawSamples.reduce(function (sum, cur) {
                            return sum + cur.coords.accuracy;
                        }, 0) / rawSamples.length;
                }

                var reportedAccuracy = Math.max(
                    resultSample.coords.accuracy,
                    finalCentroid.accuracy,
                    Math.round(avgAcc * 0.85)
                );

                var synth = {
                    coords: {
                        latitude: finalCentroid.lat,
                        longitude: finalCentroid.lon,
                        accuracy: reportedAccuracy,
                        altitude: resultSample.coords.altitude,
                        altitudeAccuracy: resultSample.coords.altitudeAccuracy,
                        heading: resultSample.coords.heading,
                        speed: resultSample.coords.speed
                    },
                    timestamp: resultSample.timestamp,
                    meta: {
                        source: "attendify-geo-v3",
                        sampleCount: rawSamples.length,
                        usedSampleCount: finalSamples.length,
                        rejectedOutliers: rawSamples.length - finalSamples.length,
                        bestAccuracy: best0.coords.accuracy,
                        averageAccuracy: avgAcc,
                        collectionMs: elapsedMs()
                    }
                };

                resolve(synth);
            }

            function tryFinishEarly() {
                if (!minCollectionReached()) {
                    return false;
                }

                var best = getBestRaw();
                if (!best) {
                    return false;
                }

                var acc = best.coords.accuracy;

                if (acc <= TARGET_ACCURACY_M && rawSamples.length >= MIN_SAMPLES) {
                    done();
                    return true;
                }

                if (acc <= ACCEPTABLE_ACCURACY_M && rawSamples.length >= MIN_SAMPLES) {
                    setTimeout(function () {
                        if (!finished) {
                            done();
                        }
                    }, 1200);
                    return true;
                }

                return false;
            }

            function addSample(position) {
                if (finished || !position || !position.coords) {
                    return;
                }

                var acc = Number(position.coords.accuracy);
                var lat = Number(position.coords.latitude);
                var lon = Number(position.coords.longitude);

                if (!isValidCoords(lat, lon, acc)) {
                    if (onProgress) {
                        onProgress(acc, getBestRaw());
                    }
                    return;
                }

                rawSamples.push(position);

                if (onProgress) {
                    onProgress(acc, getBestRaw());
                }

                if (tryFinishEarly()) {
                    return;
                }

                if (rawSamples.length >= MAX_SAMPLES && minCollectionReached()) {
                    done();
                }
            }

            function handleError(error) {
                if (error && error.code === 1) {
                    done(error);
                }
            }

            var options = {
                enableHighAccuracy: true,
                timeout: 18000,
                maximumAge: 0
            };
            
            var fallbackOptions = {
                enableHighAccuracy: false,
                timeout: 15000,
                maximumAge: 30000
            };

            try {
                navigator.geolocation.getCurrentPosition(addSample, handleError, options);
            } catch (e) {
                // ignore
            }

            try {
                watchId = navigator.geolocation.watchPosition(addSample, handleError, options);
            } catch (e) {
                // ignore
            }
            
            setTimeout(function () {
                if (!finished && rawSamples.length === 0 && navigator.geolocation) {
                    try {
                        navigator.geolocation.getCurrentPosition(addSample, function(){}, fallbackOptions);
                    } catch (e) {}
                }
            }, 4000);

            timeoutId = setTimeout(function () {
                done();
            }, maxWaitMs);
        });
    }

    function getCollectionOptionsForRadius(adminRadiusMeters) {
        var admin = Math.max(1, Number(adminRadiusMeters) || 100);

        if (admin <= 5) {
            return { minCollectionMs: 20000, maxWaitMs: 25000 };
        }

        if (admin < 25) {
            return { minCollectionMs: 15000, maxWaitMs: 22000 };
        }

        return { minCollectionMs: MIN_COLLECTION_MS, maxWaitMs: MAX_WAIT_MS };
    }

    root.AttendifyGeo = {
        getBestPosition: getBestPosition,
        getCollectionOptionsForRadius: getCollectionOptionsForRadius,
        distanceM: distanceM,
        weightedCentroid: weightedCentroid,
        MIN_COLLECTION_MS: MIN_COLLECTION_MS,
        MAX_WAIT_MS: MAX_WAIT_MS
    };
})(window);
