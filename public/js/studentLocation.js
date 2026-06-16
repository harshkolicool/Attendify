const SYNC_DB_NAME = "AttendifyOfflineDB";
const SYNC_STORE_NAME = "attendanceQueue";

function initOfflineDB() {
    return new Promise(function(resolve, reject) {
        const request = indexedDB.open(SYNC_DB_NAME, 1);
        request.onupgradeneeded = function(e) {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
                db.createObjectStore(SYNC_STORE_NAME, { keyPath: "id", autoIncrement: true });
            }
        };
        request.onsuccess = function() { resolve(request.result); };
        request.onerror = function() { reject(request.error); };
    });
}

async function saveToOfflineQueue(payload) {
    const db = await initOfflineDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
        const store = tx.objectStore(SYNC_STORE_NAME);
        store.add({ payload: payload, timestamp: Date.now() });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

async function getOfflineQueue() {
    const db = await initOfflineDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(SYNC_STORE_NAME, "readonly");
        const store = tx.objectStore(SYNC_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

async function clearOfflineQueueItem(id) {
    const db = await initOfflineDB();
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(SYNC_STORE_NAME, "readwrite");
        const store = tx.objectStore(SYNC_STORE_NAME);
        store.delete(id);
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
    });
}

let isSyncing = false;
async function processOfflineQueue() {
    if (!navigator.onLine || isSyncing) return;
    
    try {
        const queue = await getOfflineQueue();
        if (!queue || queue.length === 0) return;

        isSyncing = true;
        let syncedCount = 0;

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            try {
                const response = await fetch("/student/attendance/mark", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify(item.payload)
                });
                
                await clearOfflineQueueItem(item.id);
                syncedCount++;

                const data = await response.json().catch(() => ({}));
            } catch (err) {
                console.log("Network dropped during sync, pausing.");
                break;
            }
        }

        if (syncedCount > 0) {
            showMessage(syncedCount + " offline attendance record(s) synced!", "success");
            setTimeout(function() { window.location.reload(); }, 2000);
        }
    } catch (e) {
        console.error("Queue sync error:", e);
    } finally {
        isSyncing = false;
    }
}

window.addEventListener('online', processOfflineQueue);
document.addEventListener('DOMContentLoaded', processOfflineQueue);

function showMessage(message, type) {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) {
        uiAlert(message);
        return;
    }

    messageBox.textContent = "";

    const div = document.createElement("div");
    div.className = type === "success" ? "success-box" : "error-box";
    div.textContent = message;

    messageBox.appendChild(div);

    setTimeout(function () {
        div.remove();
    }, 5000);
}
function getBrowserFingerprint() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    const languageToken = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages.slice(0, 4).join(",")
        : (navigator.language || "unknown");
    const width = Number(screen && screen.width) || 0;
    const height = Number(screen && screen.height) || 0;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    const stableScreen = shortEdge > 0 && longEdge > 0
        ? shortEdge + "x" + longEdge
        : "unknown";

    let webglVendor = "unknown";
    let webglRenderer = "unknown";
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "unknown";
                webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "unknown";
            }
        }
    } catch (e) {
        webglVendor = "error";
    }

    const deviceMemory = navigator.deviceMemory || "unknown";

    return [
        navigator.userAgent || "unknown",
        languageToken,
        timezone,
        stableScreen,
        screen.colorDepth || "unknown",
        navigator.platform || "unknown",
        Number(navigator.hardwareConcurrency || 0) || "unknown",
        deviceMemory,
        Number(navigator.maxTouchPoints || 0) || 0,
        webglVendor,
        webglRenderer
    ].join("|");
}

function createIcon(className) {
    const icon = document.createElement("i");
    icon.className = className;
    return icon;
}

function createPresentBadge() {
    const badge = document.createElement("span");
    badge.className = "status-badge present";
    badge.appendChild(createIcon("fa-solid fa-circle-check"));
    badge.appendChild(document.createTextNode(" Present"));
    return badge;
}

function setAttendancePresentUI(button) {
    const card = button.closest("[data-schedule-id]");

    if (card) {
        card.setAttribute("data-attendance-state", "present");

        const cardTop = card.querySelector(".class-card-top");

        if (cardTop) {
            const existingBadge = cardTop.querySelector(".status-badge");
            const presentBadge = createPresentBadge();

            if (existingBadge) {
                existingBadge.replaceWith(presentBadge);
            } else {
                cardTop.appendChild(presentBadge);
            }
        }
    }

    const actionBox = button.closest(".js-schedule-action");

    if (!actionBox) {
        button.textContent = "Marked";
        button.classList.add("marked");
        button.disabled = true;
        return;
    }

    actionBox.textContent = "";

    const markedButton = document.createElement("button");
    markedButton.className = "view-btn marked";
    markedButton.type = "button";
    markedButton.disabled = true;
    markedButton.textContent = "Attendance Marked";

    actionBox.appendChild(markedButton);
}


async function readJsonResponse(response, fallbackMessage) {
    const text = await response.text();

    if (!text) {
        return {
            success: response.ok,
            message: fallbackMessage || "Request completed."
        };
    }

    try {
        const data = JSON.parse(text);
        
        // If it's a CSRF error, automatically reload the page to get a fresh token/session
        if (!response.ok && data.message && data.message.indexOf("security token") !== -1) {
            data.message = "Session refreshing. Please wait a moment...";
            setTimeout(function() {
                window.location.reload();
            }, 1500);
        }
        
        return data;
    } catch (err) {
        return {
            success: false,
            message: fallbackMessage || "Server returned an invalid response. Please refresh and try again."
        };
    }
}

async function getAttendanceTokenWithTrustedDevice(sessionId) {
    const fingerprint = getBrowserFingerprint();

    const response = await fetch(
        "/student/attendance/device-token/" + sessionId,
        {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                browserFingerprint: fingerprint
            })
        }
    );

    const data = await readJsonResponse(response, "Trusted browser verification failed.");

    if (response.ok && data.success) {
        return data.attendanceToken;
    }

    if (data.needPasskeyStepUp) {
        throw new Error(
            data.message ||
            "Security verification is required. Please use passkey verification once, then retry trusted browser."
        );
    }

    if (data.needTrustedDevice) {
        const hint = data.message ||
            "This browser is not trusted. Ask admin to allow browser fallback, then set it up before class.";
        throw new Error(hint + " Open /student/passkeys to trust this browser.");
    }

    if (data.trustedDevicePending) {
        throw new Error(
            data.message ||
            "This trusted browser is still activating. Please wait before using it for attendance."
        );
    }

    throw new Error(data.message || "Trusted browser verification failed.");
}

async function getBestAttendanceToken(sessionId, button) {
    const authPref = localStorage.getItem('attendify_auth_pref') || 'passkey';

    if (authPref === 'trusted_browser') {
        button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Trusted Browser...';
        return await getAttendanceTokenWithTrustedDevice(sessionId);
    }

    if (
        typeof getAttendanceTokenWithPasskey !== "function" ||
        typeof passkeyLibraryReady !== "function" ||
        typeof getPasskeyBrowserHelpMessage !== "function"
    ) {
        button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Trusted Browser...';
        return await getAttendanceTokenWithTrustedDevice(sessionId);
    }

    const browserHelp = getPasskeyBrowserHelpMessage();

    if (browserHelp) {
        button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Trusted Browser...';
        return await getAttendanceTokenWithTrustedDevice(sessionId);
    }

    button.innerHTML = '<i class="fa-solid fa-fingerprint"></i> Verify Passkey...';

    try {
        return await getAttendanceTokenWithPasskey(sessionId);
    } catch (err) {
        // Enforce passkey choice. Do not fall back to trusted device if they cancel the passkey prompt.
        throw err;
    }
}

function resetAttendanceButton(button, oldHtml) {
    if (!button) {
        return;
    }

    button.innerHTML = oldHtml;
    button.disabled = false;
    button.dataset.pending = "false";
}

function getAdaptiveConfidenceThresholdFromPosition(position, radiusHint) {
    const meta = position && position.meta ? position.meta : null;
    let target = Number(meta && meta.targetConfidenceScore);

    if (!Number.isFinite(target) || target <= 0) {
        target = 50;
    }

    const radius = Math.max(1, Number(radiusHint) || 100);
    if (radius <= 5) {
        target = Math.max(target, 63);
    } else if (radius < 25) {
        target = Math.max(target, 58);
    } else if (radius <= 50) {
        target = Math.max(target, 54);
    }

    return Math.max(45, Math.min(72, target));
}

function positionNeedsRefinement(position, radiusHint) {
    const meta = position && position.meta ? position.meta : null;
    const confidenceScore = Number(meta && meta.confidenceScore);
    const threshold = getAdaptiveConfidenceThresholdFromPosition(position, radiusHint);
    const shouldRetry = Boolean(meta && meta.shouldRetry);

    return shouldRetry || !Number.isFinite(confidenceScore) || confidenceScore < threshold;
}

function shouldRunExtraRefinement(position, radiusHint) {
    const meta = position && position.meta ? position.meta : null;
    const network = meta && meta.network ? meta.network : null;
    const effectiveType = network && network.effectiveType
        ? String(network.effectiveType).toLowerCase()
        : "";
    const sampleCount = Number(meta && meta.sampleCount) || 0;
    const radius = Math.max(1, Number(radiusHint) || 100);

    return (
        radius < 25 ||
        sampleCount < 10 ||
        effectiveType === "slow-2g" ||
        effectiveType === "2g" ||
        effectiveType === "3g"
    );
}

function refineStudentPosition(basePosition, radiusHint, button, label) {
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + label;

    return getBestStudentLocationPosition(function (currentAccuracy, bestSample, sampleCountRaw) {
        const bestAcc = bestSample && bestSample.coords
            ? Math.round(bestSample.coords.accuracy)
            : Math.round(currentAccuracy);
        const sampleSuffix = Number(sampleCountRaw) > 0 ? " (" + sampleCountRaw + " samples)" : "";
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + label + " ±" + bestAcc + "m" + sampleSuffix;
    }).then(function (refinedPosition) {
        return chooseBetterGeoFix(basePosition, refinedPosition);
    }).catch(function () {
        return basePosition;
    });
}

function improveStudentPositionForAccuracy(initialPosition, radiusHint, button) {
    if (initialPosition && initialPosition.meta && initialPosition.meta.source === "mock-dev") {
        return Promise.resolve(initialPosition);
    }

    if (!positionNeedsRefinement(initialPosition, radiusHint)) {
        return Promise.resolve(initialPosition);
    }

    return refineStudentPosition(initialPosition, radiusHint, button, "Improving GPS")
        .then(function (firstRefined) {
            if (!positionNeedsRefinement(firstRefined, radiusHint)) {
                return firstRefined;
            }

            if (!shouldRunExtraRefinement(firstRefined, radiusHint)) {
                return firstRefined;
            }

            return refineStudentPosition(firstRefined, radiusHint, button, "Extra GPS check");
        });
}

function getFastGpsPosition() {
    return new Promise(function(resolve, reject) {
        if (window.AttendifyLiveStream && typeof window.AttendifyLiveStream.getBestFreshPosition === 'function') {
            const cached = window.AttendifyLiveStream.getBestFreshPosition(15000);
            if (cached) {
                return resolve({ coords: cached });
            }
        }

        navigator.geolocation.getCurrentPosition(
            function(pos) { resolve(pos); },
            function(err) { reject(err); },
            { enableHighAccuracy: true, timeout: 3000, maximumAge: 0 }
        );
    });
}

function markAttendance(sessionId, button) {
    if (!button || !sessionId) return;
    if (button.dataset.pending === "true") return;

    if (!navigator.geolocation) {
        showMessage("Your browser does not support location access.", "error");
        return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        showMessage("Location works only on HTTPS or localhost. Open the secure URL and try again.", "error");
        return;
    }

    const oldHtml = button.innerHTML;
    button.dataset.pending = "true";
    button.disabled = true;

    button.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Checking Location...';

    let finalPos = null;
    const radiusHint = getActiveSessionRadiusHint();

    getFastGpsPosition()
        .catch(function(err) {
            return null;
        })
        .then(function(pos) {
            return improveStudentPositionForAccuracy(pos, radiusHint, button);
        })
        .then(function(pos) {
            if (!pos || !pos.coords) {
                throw new Error("Could not detect your location. Please move near a window and try again.");
            }
            finalPos = pos;
            return getBestAttendanceToken(sessionId, button);
        })
        .then(function (attendanceToken) {
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Marking...';

            const payloadObj = {
                sessionId: sessionId,
                latitude: finalPos ? finalPos.coords.latitude : null,
                longitude: finalPos ? finalPos.coords.longitude : null,
                accuracy: finalPos ? finalPos.coords.accuracy : null,
                locationMeta: null,
                attendanceToken: attendanceToken,
                browserFingerprint: getBrowserFingerprint(),
                requestReview: false
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4500);

            return fetch("/student/attendance/mark", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payloadObj),
                signal: controller.signal
            }).then(res => {
                clearTimeout(timeoutId);
                return res;
            }).catch(function(err) {
                clearTimeout(timeoutId);
                // IF offline or network timeout, queue it
                if (!navigator.onLine || err.name === 'AbortError' || err.message.includes('Network')) {
                    saveOfflineAttendance(payloadObj);
                    throw new Error("You are offline. Your attendance has been saved and will sync automatically when you reconnect.");
                }
                throw new Error("Network error or timeout. Please check your connection and try again.");
            });
        })
        .then(function (response) {
            return readJsonResponse(response, "Could not mark attendance. Please refresh and try again.");
        })
        .then(function (data) {
            if (data.success) {
                button.dataset.pending = "false";
                
                showMessage(data.message || "Attendance marked successfully.", "success");
                setAttendancePresentUI(button);
                return;
            }

            const failMessage = data.message || "Could not mark attendance.";
            showMessage(failMessage, "error");
            resetAttendanceButton(button, oldHtml);
        })
        .catch(function (err) {
            console.log(err);
            // Distinguish between offline success vs actual failure
            if (err.message && err.message.includes("will sync automatically")) {
                showMessage(err.message, "info");
                setAttendancePresentUI(button); // Assume present, it will sync later
            } else {
                showMessage(err.message || "An error occurred. Please try again.", "error");
                resetAttendanceButton(button, oldHtml);
            }
        });
}

function getStudentGeolocationPermissionState() {
    if (
        !navigator.permissions ||
        typeof navigator.permissions.query !== "function"
    ) {
        return Promise.resolve("unknown");
    }

    return navigator.permissions
        .query({ name: "geolocation" })
        .then(function (status) {
            return status && status.state ? status.state : "unknown";
        })
        .catch(function () {
            return "unknown";
        });
}

function getStudentLocationErrorMessage(error, permissionState) {
    const code = Number(error && error.code);
    const name = String(error && error.name ? error.name : "").toUpperCase();
    const message = String(error && error.message ? error.message : "");
    const lowerMessage = message.toLowerCase();
    const hasStandardCode = code === 1 || code === 2 || code === 3;
    const geoKeywords = ["location", "geolocation", "gps", "position"];
    const hasGeoKeyword = geoKeywords.some(function (keyword) {
        return lowerMessage.indexOf(keyword) !== -1;
    });
    const isGeoName =
        name.indexOf("PERMISSION_DENIED") !== -1 ||
        name.indexOf("POSITION_UNAVAILABLE") !== -1 ||
        name.indexOf("TIMEOUT") !== -1;

    // Detect iOS device
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (!hasStandardCode && !isGeoName && message) {
        if (message === "Location unavailable.") {
            return "Could not fetch your GPS location. Please ensure location permissions are granted, disable battery saver, and try again.";
        }
        return message;
    }

    if (!hasStandardCode && !isGeoName && !message) {
        return "An unknown error occurred. Please refresh the page and try again.";
    }

    if (
        code === 1 ||
        name.indexOf("PERMISSION_DENIED") !== -1 ||
        (lowerMessage.indexOf("permission") !== -1 && hasGeoKeyword) ||
        permissionState === "denied"
    ) {
        if (isIOS) {
            return "Location is blocked on iOS. To fix: open Settings → Privacy & Security → Location Services → Safari (or your browser) → set to \"While Using\"."
        }
        return "Location access is blocked. Please allow location permission in browser/site settings.";
    }

    if (code === 2 || name.indexOf("POSITION_UNAVAILABLE") !== -1) {
        return "Could not detect your location. Move near a window/open area and try again.";
    }

    if (code === 3 || name.indexOf("TIMEOUT") !== -1) {
        return "Location request timed out. Please try again.";
    }

    if (permissionState === "granted") {
        return "Location permission is enabled, but GPS fix is unavailable right now. Move near a window/open area and try again.";
    }

    if (message) {
        return message;
    }

    return "Please allow location access to mark attendance.";
}

function getActiveSessionRadiusHint() {
    const bootstrapEl = document.getElementById("studentLiveSessionBootstrap");

    if (bootstrapEl && bootstrapEl.textContent) {
        try {
            const rows = JSON.parse(bootstrapEl.textContent);

            if (Array.isArray(rows) && rows.length > 0 && rows[0].radius) {
                return Number(rows[0].radius);
            }
        } catch (e) {
            // ignore
        }
    }

    const liveBtn = document.querySelector(".js-mark-attendance-btn[data-session-id]");

    if (liveBtn) {
        const card = liveBtn.closest("[data-schedule-id]");

        if (card && card.getAttribute("data-classroom-radius")) {
            return Number(card.getAttribute("data-classroom-radius"));
        }
    }

    return 100;
}

function getBestStudentLocationPosition(onProgress) {
    const radiusHint = getActiveSessionRadiusHint();

    function getWebLocation() {
        const geoOptions =
            window.AttendifyGeo && typeof window.AttendifyGeo.getCollectionOptionsForRadius === "function"
                ? window.AttendifyGeo.getCollectionOptionsForRadius(radiusHint)
                : null;

        if (window.AttendifyGeo && typeof window.AttendifyGeo.getBestPosition === "function") {
            const finalOptions = Object.assign({}, geoOptions || {}, {
                radiusHintMeters: radiusHint
            });

            return window.AttendifyGeo.getBestPosition(onProgress, finalOptions);
        }

        // Fallback: original simple sampler
        return new Promise(function (resolve, reject) {
        const samples = [];
        let lastError = null;
        let finished = false;
        let watchId = null;
        let timeoutId = null;

        const targetAccuracyMeters = 10;
        const acceptableAccuracyMeters = 15;
        const minimumSamples = 8;
        const minCollectionMs = 15000;
        const maxWaitMs = 25000;
        const startTime = Date.now();

        function cleanup() {
            if (timeoutId) clearTimeout(timeoutId);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        }

        function minCollectionReached() {
            return Date.now() - startTime >= minCollectionMs;
        }

        function getAccuracy(position) {
            return Number(
                position && position.coords &&
                Number.isFinite(Number(position.coords.accuracy))
                    ? position.coords.accuracy : 999999
            );
        }

        function getBestSample() {
            samples.sort(function (a, b) { return getAccuracy(a) - getAccuracy(b); });
            return samples[0];
        }

        function finish(error) {
            if (finished) return;
            finished = true;
            cleanup();
            if (samples.length === 0) {
                if (window.localStorage && window.localStorage.getItem('MOCK_GPS') === 'true') {
                    console.warn("Using MOCK GPS for development because real GPS failed.");
                    resolve({
                        coords: { latitude: 28.6139, longitude: 77.2090, accuracy: 15 },
                        meta: { sampleCount: 1, source: "mock-dev" }
                    });
                    return;
                }
                reject(error || lastError || new Error("Location is not available."));
                return;
            }
            resolve(getBestSample());
        }

        function addSample(position) {
            if (finished || !position || !position.coords) return;

            const lat = Number(position.coords.latitude);
            const lon = Number(position.coords.longitude);
            const accuracy = getAccuracy(position);

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lon) ||
                accuracy <= 0 ||
                accuracy > 500  // 500m matches backend MAX_GPS_ACCEPTABLE_ACCURACY; deep-indoor Wi-Fi fixes can be 100-300m
            ) {
                return;
            }

            samples.push(position);

            if (onProgress && typeof onProgress === "function") {
                onProgress(accuracy, getBestSample());
            }

            if (!minCollectionReached()) {
                return;
            }

            if (accuracy <= targetAccuracyMeters && samples.length >= minimumSamples) {
                finish();
                return;
            }

            if (samples.length >= minimumSamples && accuracy <= acceptableAccuracyMeters) {
                setTimeout(function () {
                    if (!finished) {
                        finish();
                    }
                }, 1200);
            }
        }

        function handleError(error) {
            lastError = error;
            if (error && Number(error.code) === 1) finish(error);
        }

        const options = { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 };
        navigator.geolocation.getCurrentPosition(addSample, handleError, options);
        try { watchId = navigator.geolocation.watchPosition(addSample, handleError, options); } catch (e) { lastError = e; }
        timeoutId = setTimeout(function () { finish(); }, maxWaitMs);
        });
    }

    // Web Geolocation Fallback
    return getWebLocation();
}

function chooseBetterGeoFix(firstFix, secondFix) {
    if (!firstFix || !firstFix.coords) {
        return secondFix;
    }

    if (!secondFix || !secondFix.coords) {
        return firstFix;
    }

    const firstConfidence = Number(
        firstFix.meta && Number.isFinite(Number(firstFix.meta.confidenceScore))
            ? firstFix.meta.confidenceScore
            : 0
    );
    const secondConfidence = Number(
        secondFix.meta && Number.isFinite(Number(secondFix.meta.confidenceScore))
            ? secondFix.meta.confidenceScore
            : 0
    );

    if (secondConfidence >= firstConfidence + 8) {
        return secondFix;
    }

    if (firstConfidence >= secondConfidence + 8) {
        return firstFix;
    }

    return Number(secondFix.coords.accuracy) < Number(firstFix.coords.accuracy)
        ? secondFix
        : firstFix;
}

let studentAttendanceTouchTs = 0;

function handleMarkAttendanceTrigger(event) {
    const rawTarget = event.target;

    const target = rawTarget && rawTarget.nodeType === 3
        ? rawTarget.parentElement
        : rawTarget;

    if (!target || typeof target.closest !== "function") {
        return;
    }

    const button = target.closest(".js-mark-attendance-btn[data-session-id]");

    if (!button) {
        return;
    }

    if (event.type === "touchend") {
        studentAttendanceTouchTs = Date.now();
        event.preventDefault();
    }

    if (
        event.type === "click" &&
        Date.now() - studentAttendanceTouchTs < 650
    ) {
        return;
    }

    const sessionId = button.getAttribute("data-session-id");

    if (!sessionId) {
        return;
    }

    markAttendance(sessionId, button);
}

document.addEventListener("click", handleMarkAttendanceTrigger, true);
document.addEventListener("touchend", handleMarkAttendanceTrigger, {
    capture: true,
    passive: false
});

// GPS Warmer has been removed to prevent conflicts with live tracking.
// PWA Offline Sync Listener
window.addEventListener('online', () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        console.log('[PWA] Internet reconnected! Triggering background sync...');
        navigator.serviceWorker.controller.postMessage('trigger-sync');
        
        // Show brief notification to user
        const toast = document.createElement('div');
        toast.className = 'attendify-sync-toast';
        toast.innerText = 'Internet reconnected! Syncing offline attendance...';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
});

function warmUpGPS(button) {
    if (!navigator.geolocation) {
        showMessage("Your browser does not support location access.", "error");
        return;
    }

    const oldHtml = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calibrating...';
    button.disabled = true;

    const radiusHint = getActiveSessionRadiusHint();

    getBestStudentLocationPosition(function (currentAccuracy, bestSample, sampleCountRaw) {
        const bestAcc = bestSample && bestSample.coords ? Math.round(bestSample.coords.accuracy) : Math.round(currentAccuracy);
        const sampleSuffix = Number(sampleCountRaw) > 0 ? " (" + sampleCountRaw + ")" : "";
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GPS ±' + bestAcc + 'm' + sampleSuffix;
    })
    .then(function(pos) {
        return improveStudentPositionForAccuracy(pos, radiusHint, button);
    })
    .then(function() {
        button.innerHTML = '<i class="fa-solid fa-check"></i> Calibrated';
        // Keep GPS warm after calibration so Mark Attendance gets an instant fix
        if (window.AttendifyLiveStream && typeof window.AttendifyLiveStream.start === 'function' && !window.AttendifyLiveStream.isRunning) {
            window.AttendifyLiveStream.start('global');
        }
        setTimeout(function() {
            button.innerHTML = oldHtml;
            button.disabled = false;
        }, 3000);
    })
    .catch(function(err) {
        button.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Failed';
        showMessage(err.message || "Failed to calibrate GPS.", "error");
        setTimeout(function() {
            button.innerHTML = oldHtml;
            button.disabled = false;
        }, 3000);
    });
}

// Auto GPS warm-up: if location is already granted, silently start the
// GPS chip so the first "Mark Attendance" tap is instant.
(function autoWarmUpGPS() {
    if (!navigator.geolocation || !navigator.permissions) {
        return;
    }

    navigator.permissions.query({ name: "geolocation" }).then(function(status) {
        if (status.state !== "granted") {
            return;
        }

        // Don't double-warm if live stream already running
        if (window.AttendifyLiveStream && window.AttendifyLiveStream.isRunning) {
            return;
        }

        var warmWatchId = null;
        try {
            warmWatchId = navigator.geolocation.watchPosition(
                function() {},
                function() {},
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } catch(e) {
            return;
        }

        // Stop after 2 min to save battery if no session starts
        var warmTimer = setTimeout(function() {
            if (warmWatchId !== null) {
                navigator.geolocation.clearWatch(warmWatchId);
                warmWatchId = null;
            }
        }, 2 * 60 * 1000);

        // Stop immediately once a live stream starts
        var stopCheck = setInterval(function() {
            if (window.AttendifyLiveStream && window.AttendifyLiveStream.isRunning) {
                if (warmWatchId !== null) {
                    navigator.geolocation.clearWatch(warmWatchId);
                    warmWatchId = null;
                }
                clearTimeout(warmTimer);
                clearInterval(stopCheck);
            }
        }, 3000);
    }).catch(function() {});
})();

// --- Offline Queue Sync System ---
function getOfflineQueue() {
    try {
        return JSON.parse(localStorage.getItem('attendify_offline_queue')) || [];
    } catch(e) { return []; }
}

function saveOfflineAttendance(payload) {
    const queue = getOfflineQueue();
    payload._queuedAt = Date.now();
    queue.push(payload);
    localStorage.setItem('attendify_offline_queue', JSON.stringify(queue));
    updateOfflineQueueUI();
}

function syncOfflineAttendance() {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    // Show syncing toast
    const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false });
    Toast.fire({ icon: 'info', title: `Syncing ${queue.length} pending attendance records...` });

    const promises = queue.map(payload => {
        return fetch("/student/attendance/mark", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(payload)
        }).then(r => r.json()).catch(() => ({ success: false, retry: true }));
    });

    Promise.all(promises).then(results => {
        const remainingQueue = [];
        let successCount = 0;
        
        results.forEach((res, index) => {
            if (res.success || (res.message && res.message.includes("Already marked"))) {
                successCount++;
            } else if (res.retry) {
                remainingQueue.push(queue[index]); // Keep if network failed during sync
            }
        });

        localStorage.setItem('attendify_offline_queue', JSON.stringify(remainingQueue));
        updateOfflineQueueUI();

        if (successCount > 0) {
            Toast.fire({ icon: 'success', title: `Synced ${successCount} attendance records!`, timer: 3000 });
        }
    });
}

function updateOfflineQueueUI() {
    const queue = getOfflineQueue();
    let badge = document.getElementById('offlineSyncBadge');
    
    if (queue.length > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'offlineSyncBadge';
            badge.style.position = 'fixed';
            badge.style.bottom = '20px';
            badge.style.right = '20px';
            badge.style.background = '#f59e0b';
            badge.style.color = '#fff';
            badge.style.padding = '8px 16px';
            badge.style.borderRadius = '20px';
            badge.style.boxShadow = '0 4px 12px rgba(245,158,11,0.3)';
            badge.style.zIndex = '9999';
            badge.style.fontSize = '0.85rem';
            badge.style.fontWeight = 'bold';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.gap = '8px';
            badge.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> <span>${queue.length} Pending Sync</span>`;
            document.body.appendChild(badge);
        } else {
            badge.querySelector('span').textContent = `${queue.length} Pending Sync`;
            badge.style.display = 'flex';
        }
    } else if (badge) {
        badge.style.display = 'none';
    }
}

// Auto sync when online
window.addEventListener('online', syncOfflineAttendance);
// Update UI immediately on load
document.addEventListener('DOMContentLoaded', () => {
    updateOfflineQueueUI();
    // Delay initial sync to let page load completely
    setTimeout(syncOfflineAttendance, 2000);
});

