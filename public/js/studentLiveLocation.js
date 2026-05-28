document.addEventListener("DOMContentLoaded", function () {
    const config = window.AttendifyRealtimeConfig || { mode: "socket", pollIntervalMs: 5000 };
    const mode = config.mode || "socket";

    if (mode === "disabled") {
        console.log("Live location tracking is disabled.");
        return;
    }

    const isSocketMode = mode === "socket";
    const isPollingMode = mode === "polling";
    let socket = null;

    if (isSocketMode && typeof io === "undefined") {
        return;
    }

    if (isSocketMode) {
        if (!window.AttendifySharedSocket) {
            window.AttendifySharedSocket = io({
                transports: ["websocket", "polling"],
                withCredentials: true,
                timeout: 20000,
                reconnectionAttempts: 20,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000
            });
        }

        socket = window.AttendifySharedSocket;

        if (socket.__studentLiveLocationAttached === true) {
            return;
        }

        socket.__studentLiveLocationAttached = true;
    } else if (isPollingMode) {
        if (window.__attendifyStudentLiveLocationPollingAttached === true) {
            return;
        }

        window.__attendifyStudentLiveLocationPollingAttached = true;
    } else {
        return;
    }

    let watchId = null;
    let activeSessionId = "";
    let lastSentAt = 0;
    let lastSentLat = null;
    let lastSentLon = null;
    let deviceId = "";
    let studentJoined = !isSocketMode;
    let pollingRequestPending = false;
    const pendingAfterJoin = [];
    const liveSamples = [];

    const LIVE_SAMPLE_MAX_AGE_MS = 25000;
    const LIVE_MAX_SAMPLES = 16;
    const LIVE_MAX_ACCURACY_M = 1000;
    const LIVE_SEND_HEARTBEAT_MS = 30000;

    const streamStabilizer =
        window.AttendifyLocationStabilizer &&
        typeof window.AttendifyLocationStabilizer.create === "function"
            ? window.AttendifyLocationStabilizer.create({
                  minMoveMeters: 5,
                  accuracyRatio: 0.4,
                  emaAlpha: 0.18,
                  heartbeatMs: LIVE_SEND_HEARTBEAT_MS,
                  bufferSize: 12
              })
            : null;

    function getOrCreateDeviceId() {
        try {
            const key = "attendifyDeviceId";
            const existing = localStorage.getItem(key);

            if (existing) {
                return existing;
            }

            const id =
                "dev_" +
                Math.random().toString(16).slice(2) +
                "_" +
                Date.now().toString(16);
            localStorage.setItem(key, id);
            return id;
        } catch (e) {
            return "dev_" + Date.now().toString(16);
        }
    }

    function getDeviceLabel() {
        const ua = String(navigator.userAgent || "");

        if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
        if (/Android/i.test(ua)) return "Android";
        if (/Macintosh/i.test(ua)) return "Mac";
        if (/Windows/i.test(ua)) return "Windows";
        if (/CrOS/i.test(ua)) return "Chromebook";

        return "Browser";
    }

    function canUseGeolocation() {
        return (
            typeof navigator !== "undefined" &&
            navigator.geolocation &&
            (window.isSecureContext ||
                window.location.hostname === "localhost" ||
                window.location.hostname === "127.0.0.1")
        );
    }

    function persistSessionId(sessionId) {
        try {
            if (sessionId) {
                sessionStorage.setItem("attendifyLiveSessionId", String(sessionId));
            } else {
                sessionStorage.removeItem("attendifyLiveSessionId");
            }
        } catch (e) {
            // ignore
        }
    }

    function readPersistedSessionId() {
        try {
            return sessionStorage.getItem("attendifyLiveSessionId") || "";
        } catch (e) {
            return "";
        }
    }

    function readBootstrapSessions() {
        const el = document.getElementById("studentLiveSessionBootstrap");

        if (!el || !el.textContent) {
            return [];
        }

        try {
            const parsed = JSON.parse(el.textContent);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function ensureStudentJoined(callback) {
        if (!isSocketMode || studentJoined) {
            callback();
            return;
        }

        pendingAfterJoin.push(callback);
        socket.emit("student:join");
    }

    if (isSocketMode) {
        socket.on("student:joined", function () {
            studentJoined = true;

            while (pendingAfterJoin.length > 0) {
                const next = pendingAfterJoin.shift();

                try {
                    next();
                } catch (e) {
                    // ignore
                }
            }
        });

        socket.on("connect", function () {
            studentJoined = false;
            socket.emit("student:join");
        });

        if (socket.connected) {
            socket.emit("student:join");
        }
    }

    function stopWatch() {
        if (watchId !== null && navigator.geolocation) {
            try {
                navigator.geolocation.clearWatch(watchId);
            } catch (e) {
                // ignore
            }
        }

        watchId = null;
    }

    function distanceM(lat1, lon1, lat2, lon2) {
        if (window.AttendifyGeo && typeof window.AttendifyGeo.distanceM === "function") {
            return window.AttendifyGeo.distanceM(lat1, lon1, lat2, lon2);
        }

        const r = 6371000;
        const p1 = lat1 * Math.PI / 180;
        const p2 = lat2 * Math.PI / 180;
        const dp = (lat2 - lat1) * Math.PI / 180;
        const dl = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);

        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function isUsableSample(position) {
        if (!position || !position.coords) return false;

        const lat = Number(position.coords.latitude);
        const lon = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy);

        return (
            Number.isFinite(lat) &&
            Number.isFinite(lon) &&
            Number.isFinite(accuracy) &&
            accuracy > 0 &&
            accuracy <= LIVE_MAX_ACCURACY_M
        );
    }

    function weightedCentroid(samples) {
        let totalWeight = 0;
        let lat = 0;
        let lon = 0;

        for (let i = 0; i < samples.length; i++) {
            const accuracy = Math.max(Number(samples[i].coords.accuracy || 1), 1);
            const weight = 1 / (accuracy * accuracy);
            totalWeight += weight;
            lat += Number(samples[i].coords.latitude) * weight;
            lon += Number(samples[i].coords.longitude) * weight;
        }

        if (!totalWeight) return null;

        return {
            latitude: lat / totalWeight,
            longitude: lon / totalWeight,
            accuracy: Math.sqrt(samples.length / totalWeight)
        };
    }

    function getBestSample(samples) {
        if (!samples.length) return null;

        return samples.reduce(function (best, current) {
            return Number(current.coords.accuracy) < Number(best.coords.accuracy)
                ? current
                : best;
        }, samples[0]);
    }

    function pruneSamples() {
        const now = Date.now();

        for (let i = liveSamples.length - 1; i >= 0; i--) {
            if (now - Number(liveSamples[i].timestamp || 0) > LIVE_SAMPLE_MAX_AGE_MS) {
                liveSamples.splice(i, 1);
            }
        }

        while (liveSamples.length > LIVE_MAX_SAMPLES) {
            liveSamples.shift();
        }
    }

    function getSmoothedPosition(position) {
        if (!isUsableSample(position)) {
            return null;
        }

        liveSamples.push(position);
        pruneSamples();

        if (liveSamples.length < 3) {
            return position;
        }

        let centroid = weightedCentroid(liveSamples);
        const best = getBestSample(liveSamples);

        if (!centroid || !best) {
            return position;
        }

        const threshold = Math.max(Number(best.coords.accuracy || 0) * 2.5, 35);
        const filtered = liveSamples.filter(function (sample) {
            const d = distanceM(
                Number(sample.coords.latitude),
                Number(sample.coords.longitude),
                centroid.latitude,
                centroid.longitude
            );

            return d <= threshold || sample === best;
        });

        centroid = weightedCentroid(filtered.length >= 2 ? filtered : liveSamples);

        if (!centroid) {
            return position;
        }

        return {
            coords: {
                latitude: centroid.latitude,
                longitude: centroid.longitude,
                accuracy: Math.min(Number(best.coords.accuracy), Number(centroid.accuracy)),
                altitude: best.coords.altitude,
                altitudeAccuracy: best.coords.altitudeAccuracy,
                heading: best.coords.heading,
                speed: best.coords.speed
            },
            timestamp: best.timestamp || Date.now(),
            meta: {
                source: "attendify-live-smooth-v1",
                sampleCount: liveSamples.length,
                usedSampleCount: filtered.length,
                bestAccuracy: Number(best.coords.accuracy)
            }
        };
    }

    function postLocation(payload) {
        if (pollingRequestPending) {
            return;
        }

        pollingRequestPending = true;

        fetch("/student/live-location/update", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        })
            .catch(function () {
                // The next watch tick will retry.
            })
            .finally(function () {
                pollingRequestPending = false;
            });
    }

    function sendLocation(position) {
        const smoothedPosition = getSmoothedPosition(position);

        if (!smoothedPosition || !smoothedPosition.coords || !activeSessionId) {
            return;
        }

        const now = Date.now();
        const minSendIntervalMs = isPollingMode
            ? Math.max(Number(config.pollIntervalMs || 5000), 5000)
            : 2000;

        if (now - lastSentAt < minSendIntervalMs) {
            return;
        }

        if (
            !Number.isFinite(smoothedPosition.coords.latitude) ||
            !Number.isFinite(smoothedPosition.coords.longitude) ||
            !Number.isFinite(smoothedPosition.coords.accuracy)
        ) {
            return;
        }

        let sendLat = Number(smoothedPosition.coords.latitude);
        let sendLon = Number(smoothedPosition.coords.longitude);
        const sendAccuracy = Number(smoothedPosition.coords.accuracy);

        if (streamStabilizer) {
            const stable = streamStabilizer.update(sendLat, sendLon, sendAccuracy);

            if (!stable.moved && !stable.isFirst) {
                return;
            }

            sendLat = stable.lat;
            sendLon = stable.lon;
        }

        if (lastSentLat !== null && lastSentLon !== null) {
            const sinceLastSend = distanceM(lastSentLat, lastSentLon, sendLat, sendLon);
            const sendThreshold = Math.max(4, sendAccuracy * 0.35);
            const heartbeatDue = now - lastSentAt >= LIVE_SEND_HEARTBEAT_MS;

            if (sinceLastSend < sendThreshold && !heartbeatDue) {
                return;
            }
        }

        lastSentAt = now;
        lastSentLat = sendLat;
        lastSentLon = sendLon;

        const payload = {
            sessionId: activeSessionId,
            deviceId: deviceId,
            deviceLabel: getDeviceLabel(),
            latitude: sendLat,
            longitude: sendLon,
            accuracy: sendAccuracy,
            heading: smoothedPosition.coords.heading,
            speed: smoothedPosition.coords.speed,
            locationMeta: smoothedPosition.meta || null
        };

        if (isSocketMode) {
            ensureStudentJoined(function () {
                socket.emit("student:location:update", payload);
            });
            return;
        }

        postLocation(payload);
    }

    function sendOfflineUpdate() {
        if (!activeSessionId) return;
        
        const payload = {
            sessionId: activeSessionId,
            deviceId: deviceId,
            deviceLabel: getDeviceLabel(),
            online: false,
            updatedAt: new Date()
        };
        
        if (isSocketMode && socket && socket.connected) {
            socket.emit("student:location:update", payload);
        } else if (!isSocketMode && navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
            navigator.sendBeacon("/student/live-location", blob);
        }
    }

    window.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "hidden") {
            sendOfflineUpdate();
        } else if (document.visibilityState === "visible" && activeSessionId) {
            refreshFromDom();
        }
    });

    window.addEventListener("pagehide", function() {
        sendOfflineUpdate();
    });

    function startWatch(sessionId) {
        if (!sessionId || !canUseGeolocation()) {
            return;
        }

        if (activeSessionId === sessionId && watchId !== null) {
            return;
        }

        activeSessionId = String(sessionId);
        persistSessionId(activeSessionId);
        liveSamples.length = 0;
        lastSentLat = null;
        lastSentLon = null;
        lastSentAt = 0;

        if (streamStabilizer && typeof streamStabilizer.reset === "function") {
            streamStabilizer.reset();
        }

        stopWatch();

        function startContinuousWatch() {
            if (watchId !== null) return;
            const watchOptions = {
                enableHighAccuracy: true,
                maximumAge: 2500,
                timeout: 20000
            };

            try {
                watchId = navigator.geolocation.watchPosition(
                    sendLocation,
                    function (error) {
                        if (error && error.code === 1) {
                            stopWatch();
                        }
                    },
                    watchOptions
                );
            } catch (e) {
                stopWatch();
            }
        }

        try {
            if (window.AttendifyGeo && typeof window.AttendifyGeo.getBestPosition === "function") {
                window.AttendifyGeo.getBestPosition(
                    function (acc, best) {
                        if (best) sendLocation(best);
                    },
                    { minCollectionMs: 6000, maxWaitMs: 15000 }
                ).then(function (best) {
                    sendLocation(best);
                    startContinuousWatch();
                }).catch(function () {
                    startContinuousWatch();
                });
            } else {
                const initialOptions = {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 20000
                };
                navigator.geolocation.getCurrentPosition(
                    sendLocation,
                    function () {},
                    initialOptions
                );
                startContinuousWatch();
            }
        } catch (e) {
            stopWatch();
        }
    }

    function findFirstLiveSessionIdOnPage() {
        const liveCard =
            document.querySelector("[data-attendance-state='live'][data-session-id]") ||
            document.querySelector(".js-mark-attendance-btn[data-session-id]");

        if (liveCard) {
            const fromDom = liveCard.getAttribute("data-session-id") || "";

            if (fromDom) {
                return fromDom;
            }
        }

        const bootstrap = readBootstrapSessions();

        for (let i = 0; i < bootstrap.length; i++) {
            if (bootstrap[i] && bootstrap[i].sessionId) {
                return String(bootstrap[i].sessionId);
            }
        }

        return readPersistedSessionId();
    }

    function refreshFromDom() {
        const sessionId = findFirstLiveSessionIdOnPage();

        if (!sessionId) {
            if (!activeSessionId) {
                stopWatch();
            }

            return;
        }

        startWatch(sessionId);
    }

    deviceId = getOrCreateDeviceId();
    refreshFromDom();

    if (isSocketMode) {
        socket.on("attendance:started", function (payload) {
            if (payload && payload.sessionId) {
                startWatch(String(payload.sessionId));
            }
        });

        socket.on("attendance:ended", function (payload) {
            if (payload && payload.sessionId && String(payload.sessionId) === activeSessionId) {
                activeSessionId = "";
                persistSessionId("");
                stopWatch();
            }
        });
    }

    setInterval(refreshFromDom, 4000);
});
