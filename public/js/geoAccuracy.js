/**
 * AttendifyGeo — high-confidence geolocation sampler.
 *
 * Goals:
 * - Improve real-world stability across Wi-Fi and cellular links.
 * - Avoid single-sample spikes by using weighted multi-sample fusion.
 * - Return confidence metadata so backend can enforce safer decisions.
 */
(function (root) {
    "use strict";

    var TARGET_ACCURACY_M = 15;
    var ACCEPTABLE_ACCURACY_M = 35;
    var WEAK_ACCURACY_M = 80;
    var MAX_ACCURACY_ALLOWED_M = 25000;

    var MIN_SAMPLES = 4;
    var MAX_SAMPLES = 20;
    var MIN_COLLECTION_MS = 1500;
    var MAX_WAIT_MS = 25000;

    var OUTLIER_SIGMA = 2.5;
    var MAX_SPEED_KMH = 120;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function distanceM(lat1, lon1, lat2, lon2) {
        var R = 6371000;
        var p1 = (lat1 * Math.PI) / 180;
        var p2 = (lat2 * Math.PI) / 180;
        var dp = ((lat2 - lat1) * Math.PI) / 180;
        var dl = ((lon2 - lon1) * Math.PI) / 180;
        var a =
            Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
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
            acc > 0 &&
            acc <= MAX_ACCURACY_ALLOWED_M
        );
    }

    function getConnectionMeta() {
        var c =
            (navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) ||
            null;

        if (!c) {
            return {
                effectiveType: "unknown",
                rtt: null,
                downlink: null,
                saveData: false
            };
        }

        return {
            effectiveType: String(c.effectiveType || "unknown").toLowerCase(),
            rtt: Number.isFinite(Number(c.rtt)) ? Number(c.rtt) : null,
            downlink: Number.isFinite(Number(c.downlink)) ? Number(c.downlink) : null,
            saveData: Boolean(c.saveData)
        };
    }

    function getConnectionLinkType(connectionMeta) {
        var c =
            (navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection)) ||
            null;

        if (!c || !c.type) {
            return "";
        }

        return String(c.type).toLowerCase();
    }

    function isConstrainedMobileNetwork(connectionMeta) {
        if (!connectionMeta) {
            return false;
        }

        var type = connectionMeta.effectiveType;

        if (type === "slow-2g" || type === "2g" || type === "3g") {
            return true;
        }

        if (type === "4g" && getConnectionLinkType(connectionMeta) === "cellular") {
            return true;
        }

        return false;
    }

    function getAdaptiveConfidenceTarget(connectionMeta, radiusHintMeters) {
        var radius = Math.max(1, Number(radiusHintMeters) || 100);
        var target = 50;
        var net = connectionMeta || { effectiveType: "unknown", rtt: null, downlink: null };

        if (radius <= 5) {
            target += 13;
        } else if (radius < 25) {
            target += 9;
        } else if (radius <= 50) {
            target += 5;
        }

        if (net.effectiveType === "slow-2g" || net.effectiveType === "2g") {
            target += 9;
        } else if (net.effectiveType === "3g") {
            target += 7;
        } else if (net.effectiveType === "4g") {
            target += 4;
        }

        if (Number.isFinite(net.rtt) && net.rtt >= 300) {
            target += 3;
        }

        if (Number.isFinite(net.downlink) && net.downlink > 0 && net.downlink < 1) {
            target += 3;
        }

        return clamp(Math.round(target), 45, 72);
    }

    function weightedCentroid(positions) {
        if (!positions || positions.length === 0) {
            return null;
        }

        var totalWeight = 0;
        var weightedLat = 0;
        var weightedLon = 0;

        for (var i = 0; i < positions.length; i++) {
            var c = positions[i].coords;
            var acc = Math.max(Number(c.accuracy || 1), 1);
            var w = 1 / (acc * acc);
            totalWeight += w;
            weightedLat += Number(c.latitude) * w;
            weightedLon += Number(c.longitude) * w;
        }

        if (totalWeight <= 0) {
            return null;
        }

        return {
            lat: weightedLat / totalWeight,
            lon: weightedLon / totalWeight,
            accuracy: Math.sqrt(positions.length / totalWeight)
        };
    }

    function nearestSampleToCentroid(positions, centroid) {
        var best = null;
        var bestScore = Infinity;

        for (var i = 0; i < positions.length; i++) {
            var c = positions[i].coords;
            var d = distanceM(c.latitude, c.longitude, centroid.lat, centroid.lon);
            var score = d + Number(c.accuracy || 0) * 0.5;

            if (score < bestScore) {
                bestScore = score;
                best = positions[i];
            }
        }

        return best;
    }

    function percentile(values, p) {
        if (!values || values.length === 0) {
            return 0;
        }

        var sorted = values.slice().sort(function (a, b) {
            return a - b;
        });

        var idx = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
        return sorted[idx];
    }

    function computeSpreadMetrics(positions, centroid) {
        if (!positions || positions.length === 0 || !centroid) {
            return { p50: 0, p90: 0, max: 0 };
        }

        var distances = [];

        for (var i = 0; i < positions.length; i++) {
            var c = positions[i].coords;
            distances.push(distanceM(c.latitude, c.longitude, centroid.lat, centroid.lon));
        }

        return {
            p50: percentile(distances, 0.5),
            p90: percentile(distances, 0.9),
            max: percentile(distances, 1)
        };
    }

    function sortSamplesByTimestamp(positions) {
        return positions.slice().sort(function (a, b) {
            return Number(a.timestamp || 0) - Number(b.timestamp || 0);
        });
    }

    function rejectOutliers(positions, centroid, bestAcc) {
        var now = Date.now();
        var ordered = sortSamplesByTimestamp(positions);
        var spread = computeSpreadMetrics(ordered, centroid);
        var threshold = Math.max(bestAcc * OUTLIER_SIGMA, spread.p90 * 1.8, 30);
        var filtered = [];

        for (var i = 0; i < ordered.length; i++) {
            var pos = ordered[i];
            var c = pos.coords;

            if (now - Number(pos.timestamp || now) > 45000) {
                continue;
            }

            var d = distanceM(c.latitude, c.longitude, centroid.lat, centroid.lon);
            if (d > threshold) {
                continue;
            }

            if (i > 0) {
                var prev = ordered[i - 1];
                var dtSec = Math.max((Number(pos.timestamp || now) - Number(prev.timestamp || now)) / 1000, 1);
                var jumpM = distanceM(c.latitude, c.longitude, prev.coords.latitude, prev.coords.longitude);
                var speedKmh = (jumpM / dtSec) * 3.6;

                if (speedKmh > MAX_SPEED_KMH) {
                    continue;
                }
            }

            filtered.push(pos);
        }

        return filtered.length >= 2 ? filtered : ordered;
    }

    function scoreInverse(value, goodValue, badValue) {
        var v = Number(value);

        if (!Number.isFinite(v)) {
            return 0;
        }

        if (v <= goodValue) {
            return 1;
        }

        if (v >= badValue) {
            return 0;
        }

        return 1 - (v - goodValue) / Math.max(1, badValue - goodValue);
    }

    function calculateConfidence(metrics) {
        var bestAccScore = scoreInverse(metrics.bestAccuracy, 5, 85) * 42;
        var spreadScore = scoreInverse(metrics.spreadP90, 7, 75) * 25;
        var sampleScore = clamp((metrics.usedSampleCount / 18) * 20, 0, 20);
        var timeScore = clamp((metrics.collectionMs / 22000) * 13, 0, 13);

        var penalty = 0;

        if (metrics.connection && metrics.connection.effectiveType === "slow-2g") {
            penalty += 10;
        } else if (metrics.connection && metrics.connection.effectiveType === "2g") {
            penalty += 8;
        } else if (metrics.connection && metrics.connection.effectiveType === "3g") {
            penalty += 4;
        }

        if (metrics.connection && Number.isFinite(metrics.connection.rtt) && metrics.connection.rtt >= 300) {
            penalty += 4;
        }

        if (metrics.connection && Number.isFinite(metrics.connection.downlink) && metrics.connection.downlink > 0 && metrics.connection.downlink < 1) {
            penalty += 3;
        }

        var total = Math.round(bestAccScore + spreadScore + sampleScore + timeScore - penalty);
        return clamp(total, 1, 99);
    }

    function getCollectionOptionsForRadius(adminRadiusMeters, connectionMeta) {
        var admin = Math.max(1, Number(adminRadiusMeters) || 100);
        var net = connectionMeta || getConnectionMeta();

        var minMs = MIN_COLLECTION_MS;
        var maxMs = MAX_WAIT_MS;

        if (admin <= 5) {
            minMs = 6000;
            maxMs = 14000;
        } else if (admin < 25) {
            minMs = 5000;
            maxMs = 12000;
        }

        if (isConstrainedMobileNetwork(net)) {
            minMs += 2000;
            maxMs += 3000;
        }

        if (net && (net.effectiveType === "slow-2g" || net.effectiveType === "2g")) {
            minMs += 2000;
            maxMs += 3000;
        }

        if (net && Number.isFinite(net.rtt) && net.rtt >= 300) {
            minMs += 1000;
            maxMs += 1000;
        }

        if (net && net.saveData) {
            minMs += 500;
        }

        return {
            minCollectionMs: minMs,
            maxWaitMs: maxMs
        };
    }

    function getBestPosition(onProgress, options) {
        options = options || {};

        var connectionMeta = getConnectionMeta();
        var radiusHintMeters = Number(options.radiusHintMeters) || 100;
        var defaultCollection = getCollectionOptionsForRadius(radiusHintMeters, connectionMeta);

        var minCollectionMs = Number(options.minCollectionMs) || defaultCollection.minCollectionMs;
        var maxWaitMs = Number(options.maxWaitMs) || defaultCollection.maxWaitMs;

        if (maxWaitMs < minCollectionMs + 3000) {
            maxWaitMs = minCollectionMs + 3000;
        }

        // Fast timeout for local development testing
        if (window.localStorage && window.localStorage.getItem('MOCK_GPS') === 'true') {
            minCollectionMs = 1000;
            maxWaitMs = 4000;
        }

        return new Promise(function (resolve, reject) {
            var rawSamples = [];
            var finished = false;
            var watchId = null;
            var timeoutId = null;
            var fallbackTimeoutId = null;
            var usingFallback = false;
            var errorRetryCount = 0;
            var startTime = Date.now();
            var isLiveStreamActive = false;
            var liveStreamUnsubscribe = null;

            root.__attendifyGeoActiveCount = Number(root.__attendifyGeoActiveCount || 0) + 1;

            function cleanup() {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                if (fallbackTimeoutId) {
                    clearTimeout(fallbackTimeoutId);
                }

                if (isLiveStreamActive && liveStreamUnsubscribe) {
                    liveStreamUnsubscribe();
                    liveStreamUnsubscribe = null;
                    isLiveStreamActive = false;
                }

                if (watchId !== null && navigator.geolocation) {
                    try {
                        navigator.geolocation.clearWatch(watchId);
                    } catch (e) {
                        // ignore
                    }
                    watchId = null;
                }

                root.__attendifyGeoActiveCount = Math.max(0, Number(root.__attendifyGeoActiveCount || 1) - 1);
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

            function buildFinalResult(finalSamples) {
                var centroid = weightedCentroid(finalSamples);
                var best = getBestRaw();

                if (!centroid || !best) {
                    return null;
                }

                var representative = nearestSampleToCentroid(finalSamples, centroid) || best;
                var averageAccuracy =
                    rawSamples.reduce(function (sum, cur) {
                        return sum + Number(cur.coords.accuracy || 0);
                    }, 0) / Math.max(rawSamples.length, 1);

                var spread = computeSpreadMetrics(finalSamples, centroid);
                var targetConfidence = getAdaptiveConfidenceTarget(connectionMeta, radiusHintMeters);
                var confidenceScore = calculateConfidence({
                    bestAccuracy: Number(best.coords.accuracy || 0),
                    spreadP90: spread.p90,
                    usedSampleCount: finalSamples.length,
                    collectionMs: elapsedMs(),
                    connection: connectionMeta
                });

                var reportedAccuracy = Math.max(
                    Number(representative.coords.accuracy || 0),
                    Number(centroid.accuracy || 0),
                    Math.round(averageAccuracy * 0.9),
                    Math.round(spread.p90 * 0.7)
                );

                var isWeakFix = reportedAccuracy > WEAK_ACCURACY_M;
                var shouldRetry = confidenceScore < targetConfidence || isWeakFix;

                return {
                    coords: {
                        latitude: centroid.lat,
                        longitude: centroid.lon,
                        accuracy: reportedAccuracy,
                        altitude: representative.coords.altitude,
                        altitudeAccuracy: representative.coords.altitudeAccuracy,
                        heading: representative.coords.heading,
                        speed: representative.coords.speed
                    },
                    timestamp: representative.timestamp,
                    meta: {
                        source: "attendify-geo-v4",
                        sampleCount: rawSamples.length,
                        usedSampleCount: finalSamples.length,
                        rejectedOutliers: rawSamples.length - finalSamples.length,
                        bestAccuracy: Number(best.coords.accuracy || 0),
                        averageAccuracy: averageAccuracy,
                        spreadP50: spread.p50,
                        spreadP90: spread.p90,
                        spreadMax: spread.max,
                        collectionMs: elapsedMs(),
                        confidenceScore: confidenceScore,
                        targetConfidenceScore: targetConfidence,
                        shouldRetry: shouldRetry,
                        network: connectionMeta
                    }
                };
            }

            function done(error) {
                if (finished) {
                    return;
                }

                finished = true;
                cleanup();

                if (rawSamples.length === 0) {
                    var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    if (isLocal || (window.localStorage && window.localStorage.getItem('MOCK_GPS') === 'true')) {
                        console.warn("Using MOCK GPS for development because real GPS failed.");
                        resolve({
                            coords: { latitude: 28.6139, longitude: 77.2090, accuracy: 15 },
                            meta: { sampleCount: 1, source: "mock-dev" }
                        });
                        return;
                    }

                    // Production-Ready Ultra-Redundant IP Fallback
                    console.warn("Hardware GPS failed. Falling back to IP-based location.");
                    
                    function fetchSecondaryIp() {
                        return fetch("https://ipapi.co/json/")
                            .then(function(res) { return res.json(); })
                            .then(function(data) {
                                if (data && data.latitude && data.longitude) {
                                    return {
                                        coords: { latitude: Number(data.latitude), longitude: Number(data.longitude), accuracy: 8000 },
                                        meta: { sampleCount: 1, source: "ip-fallback-secondary" }
                                    };
                                }
                                throw new Error("Secondary IP fallback failed");
                            });
                    }

                    fetch("https://get.geojs.io/v1/ip/geo.json")
                        .then(function(res) { return res.json(); })
                        .then(function(data) {
                            if (data && data.latitude && data.longitude) {
                                resolve({
                                    coords: { latitude: Number(data.latitude), longitude: Number(data.longitude), accuracy: 8000 },
                                    meta: { sampleCount: 1, source: "ip-fallback-primary" }
                                });
                            } else {
                                throw new Error("Primary IP fallback returned no coordinates.");
                            }
                        })
                        .catch(function() {
                            return fetchSecondaryIp().then(resolve);
                        })
                        .catch(function() {
                            // ULTIMATE FAILSAFE: If the user has zero hardware GPS, and zero IP location services working (e.g. adblocker strict mode),
                            // we STILL resolve the promise with a massive accuracy so that the backend can successfully log the Attendance Attempt.
                            // This ensures the button never hangs and the student never gets a cryptic crash error.
                            resolve({
                                coords: { latitude: 0, longitude: 0, accuracy: 9999999 },
                                meta: { sampleCount: 1, source: "ultimate-failsafe" }
                            });
                        });
                    return;
                }

                var centroid0 = weightedCentroid(rawSamples);
                var best0 = getBestRaw();

                if (!centroid0 || !best0) {
                    reject(error || new Error("Location unavailable."));
                    return;
                }

                var filtered = rejectOutliers(rawSamples, centroid0, Number(best0.coords.accuracy || 0));
                var finalResult = buildFinalResult(filtered);

                if (!finalResult) {
                    reject(error || new Error("Location unavailable."));
                    return;
                }

                resolve(finalResult);
            }

            function shouldFinishEarly() {
                var bestAcc = getBestAccuracy();

                // INSTANT FAST-PATH: If we get a highly accurate lock (< 15 meters) from a real GPS chip instantly,
                // do not make the user wait 10 seconds! Accept it immediately for lightning-fast attendance.
                if (bestAcc <= TARGET_ACCURACY_M && rawSamples.length >= 1) {
                    return true;
                }

                if (!minCollectionReached()) {
                    return false;
                }

                if (rawSamples.length < MIN_SAMPLES) {
                    return false;
                }

                var centroid = weightedCentroid(rawSamples);
                var best = getBestRaw();

                if (!centroid || !best) {
                    return false;
                }

                var filtered = rejectOutliers(rawSamples, centroid, Number(best.coords.accuracy || 0));
                var preview = buildFinalResult(filtered);

                if (!preview || !preview.meta) {
                    return false;
                }

                var bestAcc = Number(best.coords.accuracy || 9999);
                var confidence = Number(preview.meta.confidenceScore || 0);
                var targetConfidence = Number(preview.meta.targetConfidenceScore || 50);

                if (bestAcc <= TARGET_ACCURACY_M && confidence >= Math.max(45, targetConfidence)) {
                    return true;
                }

                if (bestAcc <= ACCEPTABLE_ACCURACY_M && confidence >= Math.max(38, targetConfidence - 10)) {
                    return true;
                }

                if (bestAcc <= WEAK_ACCURACY_M && rawSamples.length >= MIN_SAMPLES && elapsedMs() >= minCollectionMs) {
                    return true;
                }

                return false;
            }

            function addSample(position) {
                if (finished || !position || !position.coords) {
                    return;
                }

                var lat = Number(position.coords.latitude);
                var lon = Number(position.coords.longitude);
                var acc = Number(position.coords.accuracy);

                if (!isValidCoords(lat, lon, acc)) {
                if (typeof onProgress === "function") {
                    onProgress(acc, getBestRaw(), rawSamples.length);
                }
                return;
            }

            rawSamples.push(position);

                if (rawSamples.length > MAX_SAMPLES) {
                    rawSamples.shift();
                }

                if (typeof onProgress === "function") {
                    onProgress(acc, getBestRaw(), rawSamples.length);
                }

                if (shouldFinishEarly()) {
                    done();
                    return;
                }
            }

            function getBestAccuracy() {
                var best = getBestRaw();
                return best ? Number(best.coords.accuracy || 9999) : 9999;
            }

            function shouldUseFallbackMode() {
                if (usingFallback) {
                    return false;
                }

                if (rawSamples.length === 0) {
                    return true;
                }

                return minCollectionReached() && getBestAccuracy() > WEAK_ACCURACY_M;
            }

            function startWatch(options, isFallback) {
                if (finished) {
                    return;
                }

                if (isLiveStreamActive && liveStreamUnsubscribe) {
                    liveStreamUnsubscribe();
                    liveStreamUnsubscribe = null;
                    isLiveStreamActive = false;
                }

                if (watchId !== null) {
                    try {
                        navigator.geolocation.clearWatch(watchId);
                    } catch (e) {
                        // ignore
                    }
                    watchId = null;
                }

                usingFallback = Boolean(isFallback);

                if (window.AttendifyLiveStream && !usingFallback) {
                    isLiveStreamActive = true;
                    liveStreamUnsubscribe = window.AttendifyLiveStream.subscribe(addSample);
                    return;
                }

                if (!navigator.geolocation) {
                    return;
                }

                try {
                    navigator.geolocation.getCurrentPosition(
                        addSample,
                        function() { /* Ignore kickstart errors, rely on watchPosition */ },
                        options
                    );
                    watchId = navigator.geolocation.watchPosition(addSample, handleError, options);
                } catch (e) {
                    // ignore
                }
            }

            function switchToFallbackMode() {
                if (!shouldUseFallbackMode() || !navigator.geolocation) {
                    return;
                }

                startWatch(
                    {
                        enableHighAccuracy: false,
                        timeout: 15000,
                        maximumAge: 60000
                    },
                    true
                );
            }

            function handleError(error) {
                if (!error) {
                    return;
                }

                if (Number(error.code) === 1) {
                    done(error);
                    return;
                }

                if (Number(error.code) === 2 || Number(error.code) === 3) {
                    // Give the hardware at least a few seconds to acquire a lock before panicking
                    if (elapsedMs() < 4000) {
                        return;
                    }

                    errorRetryCount += 1;

                    if (errorRetryCount <= 2) {
                        switchToFallbackMode();
                        return;
                    }

                    if (rawSamples.length > 0) {
                        done();
                    } else {
                        done(error);
                    }
                }
            }

            var optionsPrimary = {
                enableHighAccuracy: true,
                timeout: 25000,
                maximumAge: 10000
            };

            startWatch(optionsPrimary, false);

            var fallbackDelay = 8000;
            if (window.localStorage && window.localStorage.getItem('MOCK_GPS') === 'true') {
                fallbackDelay = 2000;
            }

            fallbackTimeoutId = setTimeout(function () {
                switchToFallbackMode();
            }, fallbackDelay);

            timeoutId = setTimeout(function () {
                done();
            }, maxWaitMs);
        });
    }

    root.AttendifyGeo = {
        getBestPosition: getBestPosition,
        getCollectionOptionsForRadius: getCollectionOptionsForRadius,
        getConnectionMeta: getConnectionMeta,
        isGeoCollectionActive: function () {
            return Number(root.__attendifyGeoActiveCount || 0) > 0;
        },
        distanceM: distanceM,
        weightedCentroid: weightedCentroid,
        MIN_COLLECTION_MS: MIN_COLLECTION_MS,
        MAX_WAIT_MS: MAX_WAIT_MS
    };
})(window);
