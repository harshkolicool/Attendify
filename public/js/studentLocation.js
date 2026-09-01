// Attendify Student Location & Attendance Client Engine

function showMessage(message, type) {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) {
        if (typeof Swal !== "undefined") {
            Swal.fire({
                title: type === "success" ? "Success" : (type === "info" ? "Notice" : "Error"),
                text: message,
                icon: type === "success" ? "success" : (type === "info" ? "info" : "error"),
                confirmButtonColor: "#2563eb",
                customClass: {
                    container: "shell-enhanced-container",
                    popup: "shell-enhanced-alert",
                    title: "shell-enhanced-title",
                    htmlContainer: "shell-enhanced-text",
                    actions: "shell-enhanced-actions",
                    confirmButton: "shell-enhanced-confirm"
                }
            });
        } else if (typeof uiAlert === "function") {
            uiAlert(message);
        } else {
            alert(message);
        }
        return;
    }

    messageBox.textContent = "";

    const div = document.createElement("div");
    div.className = type === "success" ? "success-box" : (type === "info" ? "info-box" : "error-box");
    div.textContent = message;

    messageBox.appendChild(div);

    setTimeout(function () {
        div.remove();
    }, 6000);
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

    try {
        return await getAttendanceTokenWithPasskey(sessionId);
    } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        const isTlsOrEnvironmentError = /TLS|certificate|insecure|not supported|relying party|NotAllowedError|InvalidStateError|SecurityError|network/i.test(msg);
        
        if (isTlsOrEnvironmentError) {
            console.warn("Passkey unavailable in current browser/tunnel TLS environment. Falling back to Trusted Browser verification...", err);
            button.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Trusted Browser...';
            return await getAttendanceTokenWithTrustedDevice(sessionId);
        }
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


function getFastGpsPosition() {
    return new Promise(function(resolve, reject) {
        // 1. Check window.AttendifyLatestPosition from active location stream (max 30s old)
        if (window.AttendifyLatestPosition && Number.isFinite(window.AttendifyLatestPosition.latitude)) {
            const age = Date.now() - (window.AttendifyLatestPosition.timestamp || 0);
            if (age < 30000 && Number.isFinite(window.AttendifyLatestPosition.latitude)) {
                return resolve({
                    coords: {
                        latitude: window.AttendifyLatestPosition.latitude,
                        longitude: window.AttendifyLatestPosition.longitude,
                        accuracy: window.AttendifyLatestPosition.accuracy || 15
                    },
                    timestamp: window.AttendifyLatestPosition.timestamp || Date.now()
                });
            }
        }

        // 2. Check window.AttendifyLiveStream buffer
        if (window.AttendifyLiveStream && typeof window.AttendifyLiveStream.getBestFreshPosition === 'function') {
            const cached = window.AttendifyLiveStream.getBestFreshPosition(30000);
            if (cached && Number.isFinite(cached.latitude)) {
                return resolve({ coords: cached });
            }
        }

        if (!navigator.geolocation) {
            return reject(new Error("Geolocation is not supported by your browser."));
        }

        // 3. Fast high-accuracy query with 5s maximumAge to avoid cold hardware stalls
        navigator.geolocation.getCurrentPosition(
            function(pos) { resolve(pos); },
            function(err) {
                // 4. Instant fallback query with standard accuracy
                navigator.geolocation.getCurrentPosition(
                    function(fallbackPos) { resolve(fallbackPos); },
                    function(fallbackErr) {
                        // Last resort: if any location was captured during session
                        if (window.AttendifyLatestPosition && Number.isFinite(window.AttendifyLatestPosition.latitude)) {
                            return resolve({
                                coords: {
                                    latitude: window.AttendifyLatestPosition.latitude,
                                    longitude: window.AttendifyLatestPosition.longitude,
                                    accuracy: window.AttendifyLatestPosition.accuracy || 25
                                },
                                timestamp: Date.now()
                            });
                        }
                        reject(fallbackErr || err);
                    },
                    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
                );
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
        );
    });
}

function getOrCreateRadarModal() {
    let modal = document.getElementById("attendifyRadarScanModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "attendifyRadarScanModal";
    modal.className = "attendify-radar-backdrop";
    modal.innerHTML = `
        <div class="attendify-radar-card">
            <div class="attendify-radar-sonar">
                <div class="radar-ring ring-1"></div>
                <div class="radar-ring ring-2"></div>
                <div class="radar-ring ring-3"></div>
                <div class="radar-sweep"></div>
                <div class="radar-center-dot">
                    <i class="fa-solid fa-satellite-dish" id="radarCenterIcon"></i>
                </div>
            </div>
            <h4 class="radar-title" id="radarModalTitle">Verifying Presence</h4>
            <p class="radar-subtitle" id="radarModalSubtitle">Scanning ultrasonic acoustic pulses & GPS satellites...</p>
            <div class="radar-telemetry" id="radarModalTelemetry">
                <div class="telemetry-item" id="telemetryGps"><i class="fa-solid fa-location-dot"></i> <span>Satellite Lock</span></div>
                <div class="telemetry-item" id="telemetryAcoustic"><i class="fa-solid fa-volume-high"></i> <span>Acoustic Beacon</span></div>
                <div class="telemetry-item" id="telemetrySecurity"><i class="fa-solid fa-shield-halved"></i> <span>Passkey Auth</span></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    if (!document.getElementById("attendifyRadarScanStyles")) {
        const style = document.createElement("style");
        style.id = "attendifyRadarScanStyles";
        style.textContent = `
            .attendify-radar-backdrop {
                position: fixed; inset: 0; z-index: 99999;
                background: rgba(15, 23, 42, 0.84);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                display: flex; align-items: center; justify-content: center;
                opacity: 0; visibility: hidden; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .attendify-radar-backdrop.active { opacity: 1; visibility: visible; }
            .attendify-radar-card {
                background: linear-gradient(145deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98));
                border: 1px solid rgba(56, 189, 248, 0.35);
                border-radius: 28px; padding: 32px 28px; max-width: 360px; width: 90%;
                text-align: center; color: #fff;
                box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(6, 182, 212, 0.25);
                transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .attendify-radar-backdrop.active .attendify-radar-card { transform: scale(1); }
            .attendify-radar-sonar {
                position: relative; width: 140px; height: 140px; margin: 0 auto 20px;
                display: flex; align-items: center; justify-content: center;
            }
            .radar-ring {
                position: absolute; border-radius: 50%;
                border: 1.5px solid rgba(56, 189, 248, 0.4);
                box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
            }
            .radar-ring.ring-1 { width: 60px; height: 60px; animation: sonarPing 2.2s infinite ease-out; }
            .radar-ring.ring-2 { width: 100px; height: 100px; animation: sonarPing 2.2s infinite ease-out 0.6s; }
            .radar-ring.ring-3 { width: 140px; height: 140px; animation: sonarPing 2.2s infinite ease-out 1.2s; }
            @keyframes sonarPing {
                0% { transform: scale(0.6); opacity: 0.8; }
                100% { transform: scale(1.3); opacity: 0; }
            }
            .radar-sweep {
                position: absolute; inset: 0; border-radius: 50%;
                background: conic-gradient(from 0deg, transparent 60%, rgba(6, 182, 212, 0.45) 100%);
                animation: radarRotate 1.8s linear infinite;
            }
            @keyframes radarRotate { 100% { transform: rotate(360deg); } }
            .radar-center-dot {
                position: relative; z-index: 5; width: 44px; height: 44px; border-radius: 50%;
                background: linear-gradient(135deg, #06b6d4, #3b82f6);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 1.15rem; box-shadow: 0 0 20px rgba(6, 182, 212, 0.8);
            }
            .radar-title { font-size: 1.25rem; font-weight: 800; margin: 0 0 8px; color: #f8fafc; }
            .radar-subtitle { font-size: 0.85rem; color: #94a3b8; margin: 0 0 20px; line-height: 1.4; }
            .radar-telemetry { display: flex; justify-content: space-around; gap: 8px; font-size: 0.75rem; }
            .telemetry-item {
                display: flex; flex-direction: column; align-items: center; gap: 4px;
                padding: 8px; border-radius: 12px; background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08); color: #cbd5e1; flex: 1;
                transition: all 0.3s;
            }
            .telemetry-item.success {
                background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #34d399; font-weight: 700;
            }
            .telemetry-item.active {
                background: rgba(6, 182, 212, 0.15); border-color: rgba(6, 182, 212, 0.5); color: #38bdf8; font-weight: 700;
                animation: pulseRadar 1s infinite alternate;
            }
            @keyframes pulseRadar { to { transform: scale(1.05); } }
        `;
        document.head.appendChild(style);
    }

    return modal;
}

function showRadarScanModal() {
    const modal = getOrCreateRadarModal();
    modal.classList.add("active");
    const gpsEl = modal.querySelector("#telemetryGps");
    const acEl = modal.querySelector("#telemetryAcoustic");
    const secEl = modal.querySelector("#telemetrySecurity");
    if (gpsEl) gpsEl.className = "telemetry-item active";
    if (acEl) acEl.className = "telemetry-item";
    if (secEl) secEl.className = "telemetry-item";
    const title = modal.querySelector("#radarModalTitle");
    const sub = modal.querySelector("#radarModalSubtitle");
    if (title) title.textContent = "Locking GPS Satellites";
    if (sub) sub.textContent = "Connecting to satellite constellation...";
}

function updateRadarScanStep(step, detail) {
    const modal = getOrCreateRadarModal();
    const title = modal.querySelector("#radarModalTitle");
    const sub = modal.querySelector("#radarModalSubtitle");
    const gpsEl = modal.querySelector("#telemetryGps");
    const acEl = modal.querySelector("#telemetryAcoustic");
    const secEl = modal.querySelector("#telemetrySecurity");

    if (step === "GPS_OK") {
        if (gpsEl) gpsEl.className = "telemetry-item success";
        if (acEl) acEl.className = "telemetry-item active";
        if (title) title.textContent = "Scanning Ultrasonic Radar";
        if (sub) sub.textContent = detail || "Listening for inaudible classroom pulses (18.6–19.8 kHz)...";
    } else if (step === "ACOUSTIC_OK") {
        if (acEl) acEl.className = "telemetry-item success";
        if (secEl) secEl.className = "telemetry-item active";
        if (title) title.textContent = "Verifying Passkey & Tokens";
        if (sub) sub.textContent = detail || "Seating distance captured. Submitting secure payload...";
    } else if (step === "DONE_SUCCESS") {
        if (secEl) secEl.className = "telemetry-item success";
        if (title) title.innerHTML = '<span style="color:#10b981;">Present Verified!</span>';
        if (sub) sub.textContent = detail || "Attendance marked successfully.";
    }
}

function hideRadarScanModal(delayMs) {
    const delay = typeof delayMs === "number" ? delayMs : 0;
    setTimeout(() => {
        const modal = document.getElementById("attendifyRadarScanModal");
        if (modal) modal.classList.remove("active");
    }, delay);
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
    showRadarScanModal();

    let finalPos = null;
    const radiusHint = getActiveSessionRadiusHint();

    getFastGpsPosition()
        .catch(function(err) {
            return null;
        })
        .then(function(pos) {
            if (!pos || !pos.coords) {
                throw new Error("Could not detect your location. Please move near a window and try again.");
            }
            finalPos = pos;
            updateRadarScanStep("GPS_OK", `Satellite accuracy ±${Math.round(pos.coords.accuracy || 10)}m acquired.`);
            return getBestAttendanceToken(sessionId, button);
        })
        .then(async function (attendanceToken) {
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

            let acousticProof = { verified: false };
            if (window.AttendifyAcousticRadar && window.AttendifyAcousticRadar.Listener) {
                try {
                    const listener = new window.AttendifyAcousticRadar.Listener();
                    acousticProof = await listener.capturePresence(450);
                } catch (e) {
                    console.log("Acoustic listener skipped:", e);
                }
            }

            if (acousticProof.verified) {
                updateRadarScanStep("ACOUSTIC_OK", `Seating: ${acousticProof.distanceMeters}m (${acousticProof.rowCategory || "Classroom"})`);
            } else {
                updateRadarScanStep("ACOUSTIC_OK", "Geofence satellite telemetry verified.");
            }

            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Marking...';

            const payloadObj = {
                sessionId: sessionId,
                latitude: finalPos ? finalPos.coords.latitude : null,
                longitude: finalPos ? finalPos.coords.longitude : null,
                accuracy: finalPos ? finalPos.coords.accuracy : null,
                locationMeta: null,
                attendanceToken: attendanceToken,
                browserFingerprint: getBrowserFingerprint(),
                requestReview: false,
                acousticProof: acousticProof
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
                
                let successMsg = data.message || "Attendance marked successfully.";
                if (data.status === "PRESENT" && data.measuredDistance) {
                    successMsg += ` (Seating: ${data.measuredDistance}m)`;
                }
                updateRadarScanStep("DONE_SUCCESS", successMsg);
                hideRadarScanModal(1400);
                showMessage(successMsg, "success");
                setAttendancePresentUI(button);
                return;
            }

            hideRadarScanModal(0);
            const failMessage = data.message || "Could not mark attendance.";
            showMessage(failMessage, "error");
            resetAttendanceButton(button, oldHtml);
        })
        .catch(function (err) {
            hideRadarScanModal(0);
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

