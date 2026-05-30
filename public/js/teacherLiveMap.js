function initTeacherLiveMap() {
    if (typeof L === "undefined") {
        return;
    }

    const config = window.AttendifyRealtimeConfig || { mode: "socket", pollIntervalMs: 5000 };
    const mode = config.mode || "socket";
    const isSocketMode = mode === "socket";
    const isPollingMode = mode === "polling";

    const mapEl = document.getElementById("teacherLiveMap");

    if (!mapEl || window.__attendifyTeacherMapAttached === true) {
        return;
    }

    if (mode === "disabled" || (!isSocketMode && !isPollingMode)) {
        mapEl.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#64748b;background:#f8fafc;padding:20px;text-align:center;border-radius:12px;"><div><i class="fa-solid fa-satellite" style="font-size:32px;margin-bottom:12px;opacity:0.5;"></i><p>Live map updates are disabled.</p></div></div>';
        const rosterEl = document.getElementById("teacherMapRoster");
        if (rosterEl) {
            rosterEl.innerHTML = '<div class="teacher-map-roster-empty">Live location tracking is disabled.</div>';
        }
        return;
    }

    if (isSocketMode && typeof io === "undefined") {
        return;
    }

    window.__attendifyTeacherMapAttached = true;

    let socket = null;
    let pollingTimer = null;
    let pollingRequestPending = false;

    if (isSocketMode) {
        // Re-use the shared socket that teacherRealtime.js already set up.
        socket =
            window.AttendifySharedSocket ||
            io({
                transports: ["websocket", "polling"],
                withCredentials: true,
                timeout: 20000,
                reconnectionAttempts: 20,
                reconnectionDelayMax: 5000
            });
        window.AttendifySharedSocket = socket;

        function ensureTeacherJoined() {
            if (!socket.__teacherRealtimeAttached) {
                socket.emit("teacher:join");
            }
        }

        socket.on("connect", ensureTeacherJoined);

        if (socket.connected) {
            ensureTeacherJoined();
        }
    }

    const insidePill = document.getElementById("teacherMapInsidePill");
    const nearPill = document.getElementById("teacherMapNearPill");
    const outsidePill = document.getElementById("teacherMapOutsidePill");
    const trackingPill = document.getElementById("teacherMapTrackingPill");
    const poorPill = document.getElementById("teacherMapPoorPill");
    
    const hintEl = document.getElementById("teacherMapHint");
    const rosterEl = document.getElementById("teacherMapRoster");
    const sessionSelectEl = document.getElementById("teacherMapSessionSelect");
    const mapOverlay = document.getElementById("teacherMapOverlay");
    const searchInput = document.getElementById("teacherMapSearch");
    const fitButton = document.getElementById("teacherMapFitButton");
    const centerButton = document.getElementById("teacherMapCenterButton");

    let map = null;
    let teacherMarker = null;
    let radiusCircle = null;
    let effectiveRadiusCircle = null;
    let activeSessionId = "";
    let mapInitialized = false;
    let currentSearchTerm = "";
    let sessionCenter = null;
    let hasFitInitialDevices = false;
    
    const deviceMarkers = new Map();
    const accuracyCircles = new Map();
    const deviceState = new Map();
    const rosterByStudent = new Map();
    const markerStabilizers = new Map();

    function getMarkerStabilizer(markerKey) {
        if (!window.AttendifyLocationStabilizer) {
            return null;
        }

        if (!markerStabilizers.has(markerKey)) {
            markerStabilizers.set(
                markerKey,
                window.AttendifyLocationStabilizer.create({
                    minMoveMeters: 3,
                    accuracyRatio: 0.3,
                    emaAlpha: 0.16,
                    heartbeatMs: 30000,
                    bufferSize: 10
                })
            );
        }

        return markerStabilizers.get(markerKey);
    }

    function stabilizeMarkerPosition(markerKey, lat, lon, accuracy) {
        const stabilizer = getMarkerStabilizer(markerKey);

        if (!stabilizer) {
            return { lat: lat, lon: lon, moved: true, isFirst: true };
        }

        return stabilizer.update(lat, lon, accuracy);
    }

    function readBootstrap() {
        const el = document.getElementById("teacherLiveMapBootstrap");
        if (!el || !el.textContent) return [];
        try {
            const parsed = JSON.parse(el.textContent);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function setHint(text) {
        if (hintEl) hintEl.textContent = text || "";
    }

    function formatTime(value) {
        if (!value) return "—";
        try {
            return new Date(value).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
        } catch (e) {
            return "—";
        }
    }
    
    function formatDistance(meters) {
        if (typeof meters !== 'number' || isNaN(meters)) return "Unknown";
        if (meters < 1000) return Math.round(meters) + " m away";
        return (meters / 1000).toFixed(1) + " km away";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function recalcCounts() {
        let inside = 0;
        let near = 0;
        let outside = 0;
        let poor = 0;
        let onlineDevices = 0;

        deviceState.forEach(function (device) {
            if (device.online !== false) {
                onlineDevices += 1;
                if (device.status === "INSIDE") inside++;
                else if (device.status === "NEAR") near++;
                else if (device.status === "OUTSIDE") outside++;
                else if (device.status === "POOR_ACCURACY") poor++;
            }
        });

        if (insidePill) insidePill.textContent = inside + " inside";
        if (nearPill) nearPill.textContent = near + " near";
        if (outsidePill) outsidePill.textContent = outside + " outside";
        if (poorPill) poorPill.textContent = poor + " poor GPS";
        if (trackingPill) trackingPill.textContent = onlineDevices + " live";
    }

    // Always initialize map
    if (!mapInitialized) {
        map = L.map(mapEl, {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([0, 0], 2);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 20,
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map);
        
        mapInitialized = true;
        
        setTimeout(function() {
            if (map) map.invalidateSize();
        }, 300);
        
        // Recalculate map size after window resize OR sidebar toggle
        function invalidateMap() {
            if (map) map.invalidateSize();
        }
        window.addEventListener('resize', invalidateMap);
        window.addEventListener('attendify:layout-changed', invalidateMap);
    }

    function removeDeviceLayers() {
        deviceMarkers.forEach(function (marker) {
            try { marker.remove(); } catch (e) {}
        });
        deviceMarkers.clear();

        accuracyCircles.forEach(function (circle) {
            try { circle.remove(); } catch (e) {}
        });
        accuracyCircles.clear();

        deviceState.clear();
        markerStabilizers.clear();
    }

    function fitMapToLiveData() {
        if (!map || !activeSessionId) return;

        const bounds = L.latLngBounds([]);

        if (radiusCircle && typeof radiusCircle.getBounds === "function") {
            bounds.extend(radiusCircle.getBounds());
        } else if (sessionCenter) {
            bounds.extend([sessionCenter.lat, sessionCenter.lon]);
        }

        deviceMarkers.forEach(function (marker) {
            try {
                bounds.extend(marker.getLatLng());
            } catch (e) {
                // ignore
            }
        });

        if (!bounds.isValid()) return;

        map.fitBounds(bounds, {
            padding: [36, 36],
            maxZoom: deviceMarkers.size > 0 ? 19 : 18,
            animate: true
        });
    }

    function centerOnSession() {
        if (!map || !sessionCenter) return;

        map.setView([sessionCenter.lat, sessionCenter.lon], 18, {
            animate: true
        });

        if (teacherMarker) {
            teacherMarker.openPopup();
        }
    }

    function applySessionPayload(payload) {
        if (!payload || !payload.sessionId) return;

        seedRoster(payload.roster);
        setSessionCenter(payload);
        applySnapshot(payload.snapshot || []);
    }

    function loadPollingSnapshot(sessionId) {
        if (!sessionId || pollingRequestPending) return;

        pollingRequestPending = true;

        const url = sessionId === "global" 
            ? "/teacher/live-map/global" 
            : "/teacher/live-map/session/" + encodeURIComponent(String(sessionId));

        fetch(url, {
            method: "GET",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        })
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                if (!data || !data.success) {
                    return;
                }

                applySessionPayload(data);
            })
            .catch(function () {
                // polling retries on the next interval
            })
            .finally(function () {
                pollingRequestPending = false;
            });
    }

    function startPollingSession(sessionId) {
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }

        if (!sessionId) return;

        loadPollingSnapshot(sessionId);

        pollingTimer = setInterval(function () {
            loadPollingSnapshot(sessionId);
        }, Math.max(Number(config.pollIntervalMs || 5000), 3000));
    }

    function clearSession() {
        activeSessionId = "";
        sessionCenter = null;
        hasFitInitialDevices = false;
        if (pollingTimer) {
            clearInterval(pollingTimer);
            pollingTimer = null;
        }
        if (mapOverlay) mapOverlay.style.display = "flex";
        
        removeDeviceLayers();
        rosterByStudent.clear();

        if (teacherMarker) {
            try { teacherMarker.remove(); } catch (e) {}
            teacherMarker = null;
        }
        if (radiusCircle) {
            try { radiusCircle.remove(); } catch (e) {}
            radiusCircle = null;
        }
        if (effectiveRadiusCircle) {
            try { effectiveRadiusCircle.remove(); } catch (e) {}
            effectiveRadiusCircle = null;
        }

        if (rosterEl) rosterEl.innerHTML = '<div class="teacher-map-roster-empty">Waiting for students with location enabled…</div>';

        recalcCounts();
        setHint("Start a live session to see the radius and student markers.");
    }

    function watchSession(sessionId) {
        if (!sessionId) return;

        if (isSocketMode && socket) {
            socket.emit("teacher:watch-session", { sessionId: String(sessionId) });
            return;
        }

        startPollingSession(sessionId);
    }

    function setSessionCenter(payload) {
        if (!payload) return;

        const sessionId = String(payload.sessionId || "");
        
        if (sessionId === "global") {
            const sessionChanged = activeSessionId !== sessionId;
            activeSessionId = sessionId;
            sessionCenter = null;
            if (sessionChanged) {
                removeDeviceLayers();
                hasFitInitialDevices = false;
            }
            if (mapOverlay) mapOverlay.style.display = "none";
            
            if (teacherMarker) { try { teacherMarker.remove(); } catch(e){} teacherMarker = null; }
            if (radiusCircle) { try { radiusCircle.remove(); } catch(e){} radiusCircle = null; }
            if (effectiveRadiusCircle) { try { effectiveRadiusCircle.remove(); } catch(e){} effectiveRadiusCircle = null; }
            
            setHint("Showing all logged-in students in your college.");
            return;
        }

        const lat = Number(payload.latitude || 0);
        const lon = Number(payload.longitude || 0);
        const adminRadius = Number(
            payload.configuredRadius !== undefined ? payload.configuredRadius : payload.radius || 0
        );
        const verificationRadius = Number(
            payload.effectiveRadius || payload.verificationRadius || adminRadius
        );

        if (!sessionId || !Number.isFinite(lat) || !Number.isFinite(lon) || adminRadius <= 0) {
            setHint("Live session is active but location center is not configured yet.");
            return;
        }

        const sessionChanged = activeSessionId !== sessionId;
        activeSessionId = sessionId;
        sessionCenter = {
            lat: lat,
            lon: lon,
            radius: adminRadius,
            verificationRadius: verificationRadius
        };

        if (sessionChanged) {
            removeDeviceLayers();
            hasFitInitialDevices = false;
        }

        if (mapOverlay) mapOverlay.style.display = "none";

        if (teacherMarker) {
            teacherMarker.setLatLng([lat, lon]);
        } else {
            const teacherIcon = L.divIcon({
                className: "custom-teacher-marker",
                html: '<div style="width: 20px; height: 20px; background: #0f172a; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-chalkboard-user" style="color:white; font-size: 10px;"></i></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            teacherMarker = L.marker([lat, lon], { icon: teacherIcon, title: "Teacher Location", zIndexOffset: 1000 }).addTo(map);
            teacherMarker.bindPopup(
                "<b>Teacher / Classroom Center</b><br>Admin radius: " +
                    Math.round(adminRadius) +
                    " m<br>GPS verification zone: " +
                    Math.round(verificationRadius) +
                    " m"
            );
        }

        if (radiusCircle) {
            radiusCircle.setLatLng([lat, lon]);
            radiusCircle.setRadius(adminRadius);
        } else {
            radiusCircle = L.circle([lat, lon], {
                radius: adminRadius,
                color: "#ea580c",
                weight: 2,
                fillColor: "#fb923c",
                fillOpacity: 0.06,
                dashArray: "4, 6"
            }).addTo(map);
        }

        if (effectiveRadiusCircle) {
            effectiveRadiusCircle.setLatLng([lat, lon]);
            effectiveRadiusCircle.setRadius(verificationRadius);
        } else {
            effectiveRadiusCircle = L.circle([lat, lon], {
                radius: verificationRadius,
                color: "#16a34a",
                weight: 2,
                fillColor: "#22c55e",
                fillOpacity: 0.08
            }).addTo(map);
        }

        if (verificationRadius > adminRadius) {
            setHint(
                "Admin radius " +
                    Math.round(adminRadius) +
                    " m (orange). GPS verification zone " +
                    Math.round(verificationRadius) +
                    " m (green) — students can be inside green when GPS is uncertain."
            );
        } else {
            setHint("Showing live student devices for this session.");
        }

        if (sessionChanged || deviceMarkers.size === 0) {
            map.setView([lat, lon], 18);
        }

        setTimeout(function () {
            if (map) map.invalidateSize();
        }, 300);

        setHint("Showing live student devices for this session.");
    }

    function seedRoster(roster) {
        if (!Array.isArray(roster)) return;

        for (let i = 0; i < roster.length; i++) {
            const row = roster[i];
            if (!row || !row.studentId) continue;

            rosterByStudent.set(String(row.studentId), {
                studentId: String(row.studentId),
                fullName: row.fullName || "Student",
                enrollmentNumber: row.enrollmentNumber || row.email || ""
            });
        }
    }

    function getStudentMeta(studentId) {
        return rosterByStudent.get(String(studentId)) || {
            studentId: String(studentId),
            fullName: "Student",
            enrollmentNumber: ""
        };
    }

    function getStatusColors(status) {
        if (status === "INSIDE") return { bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0", text: "Inside" };
        if (status === "NEAR") return { bg: "#fef3c7", color: "#d97706", border: "#fde68a", text: "Near Boundary" };
        if (status === "OUTSIDE") return { bg: "#e0e7ff", color: "#4f46e5", border: "#c7d2fe", text: "Outside" };
        if (status === "POOR_ACCURACY") return { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", text: "Poor GPS" };
        if (status === "GLOBAL_TRACKING") return { bg: "#f0fdf4", color: "#22c55e", border: "#bbf7d0", text: "Online" };
        return { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", text: "Unknown" };
    }

    function renderRoster() {
        if (!rosterEl) return;

        const grouped = new Map();
        deviceState.forEach(function (device) {
            const sid = device.studentId;
            if (!grouped.has(sid)) grouped.set(sid, []);
            grouped.get(sid).push(device);
        });

        let rows = [];
        grouped.forEach(function (devices, studentId) {
            const meta = getStudentMeta(studentId);
            const latest = devices.reduce(function (best, device) {
                const ts = new Date(device.updatedAt || device.lastSeenAt || 0).getTime();
                const bestTs = new Date(best.updatedAt || best.lastSeenAt || 0).getTime();
                return ts > bestTs ? device : best;
            }, devices[0]);

            rows.push({
                meta: meta,
                devices: devices,
                latest: latest,
                distance: latest.distance || 999999,
                status: latest.online === false ? "OFFLINE" : latest.status
            });
        });

        // Add students without devices
        rosterByStudent.forEach(function (meta, studentId) {
            if (!grouped.has(studentId)) {
                rows.push({
                    meta: meta,
                    devices: [],
                    latest: null,
                    distance: 999999,
                    status: "NO_DATA"
                });
            }
        });

        // Filter by search
        if (currentSearchTerm) {
            const term = currentSearchTerm.toLowerCase();
            rows = rows.filter(r => 
                r.meta.fullName.toLowerCase().includes(term) || 
                r.meta.enrollmentNumber.toLowerCase().includes(term)
            );
        }

        // Sort: Active first, then by distance nearest
        rows.sort(function (a, b) {
            if (a.status === "NO_DATA" && b.status !== "NO_DATA") return 1;
            if (b.status === "NO_DATA" && a.status !== "NO_DATA") return -1;
            if (a.status === "OFFLINE" && b.status !== "OFFLINE") return 1;
            if (b.status === "OFFLINE" && a.status !== "OFFLINE") return -1;
            return a.distance - b.distance;
        });

        if (rows.length === 0) {
            rosterEl.innerHTML = '<div class="teacher-map-roster-empty">No students found.</div>';
            return;
        }
        
        rosterEl.innerHTML = rows.map(function (row) {
            const isOnline = row.status !== "OFFLINE" && row.status !== "NO_DATA";
            const escapedName = escapeHtml(row.meta.fullName || "Student");
            const escapedEnrollment = escapeHtml(row.meta.enrollmentNumber || "—");
            const initial = escapedName.charAt(0).toUpperCase();
            
            const c = isOnline ? getStatusColors(row.status) : { bg: "#f1f5f9", color: "#94a3b8", border: "#e2e8f0", text: "Offline" };
            const markerAttr = row.latest && isOnline
                ? ' data-marker-key="' + escapeHtml(row.latest.markerKey || "") + '" tabindex="0" role="button"'
                : "";
            
            let details = "";
            if (row.latest && isOnline) {
                details = `
                    <div style="display:flex; justify-content:space-between; margin-top: 6px; font-size: 0.8rem; color: #64748b;">
                        <span><i class="fa-solid fa-location-arrow"></i> ${formatDistance(row.latest.distance)}</span>
                        <span><i class="fa-solid fa-satellite-dish"></i> ±${Math.round(row.latest.accuracy || 0)}m</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">Last: ${escapeHtml(formatTime(row.latest.updatedAt))}</div>
                `;
            }

            return `
                <article class="teacher-map-student-card ${isOnline ? "is-live" : ""}"${markerAttr} style="border: 1px solid ${c.border}; background: #fff; border-radius: 12px; padding: 12px; margin-bottom: 8px;">
                    <div style="display: flex; gap: 12px; align-items: flex-start;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: ${c.bg}; color: ${c.color}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; border: 2px solid ${c.border};">
                            ${initial}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <strong style="font-size: 0.9rem; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 120px;">${escapedName}</strong>
                                <span style="font-size: 0.7rem; font-weight: 800; padding: 2px 6px; border-radius: 99px; background: ${c.bg}; color: ${c.color}; border: 1px solid ${c.border};">${c.text}</span>
                            </div>
                            <p style="font-size: 0.75rem; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapedEnrollment}</p>
                            ${details}
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    if (searchInput) {
        searchInput.addEventListener("input", function(e) {
            currentSearchTerm = e.target.value.trim();
            renderRoster();
        });
    }

    function openMarkerFromRoster(target) {
        if (!target || typeof target.closest !== "function") return;

        const card = target.closest(".teacher-map-student-card[data-marker-key]");
        if (!card) return;

        const markerKey = card.getAttribute("data-marker-key") || "";
        const marker = deviceMarkers.get(markerKey);

        if (!marker || !map) return;

        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 19), {
            animate: true
        });
        marker.openPopup();
    }

    if (rosterEl) {
        rosterEl.addEventListener("click", function (event) {
            openMarkerFromRoster(event.target);
        });

        rosterEl.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openMarkerFromRoster(event.target);
        });
    }

    if (fitButton) {
        fitButton.addEventListener("click", fitMapToLiveData);
    }

    if (centerButton) {
        centerButton.addEventListener("click", centerOnSession);
    }

    function upsertStudent(payload) {
        if (!payload || !payload.sessionId) return;
        const sessionId = String(payload.sessionId);
        if (!activeSessionId || sessionId !== activeSessionId) return;
        
        const studentId = String(payload.studentId || "");
        if (!studentId) return;

        const deviceId = payload.deviceId ? String(payload.deviceId) : "default";
        const markerKey = studentId + ":" + deviceId;

        const lat = Number(payload.latitude);
        const lon = Number(payload.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const stablePos = stabilizeMarkerPosition(
            markerKey,
            lat,
            lon,
            payload.accuracy
        );
        const drawLat = stablePos.lat;
        const drawLon = stablePos.lon;

        const online = payload.online !== false;
        const distance = Number(payload.distance || 0);
        const accuracy = payload.accuracy === null || payload.accuracy === undefined ? null : Number(payload.accuracy);
        
        const configuredRadius = payload.configuredRadius || 0;
        const effectiveRadius = payload.effectiveRadius || 0;
        const status = payload.status || "UNKNOWN";
        const meta = getStudentMeta(studentId);
        const fullName = payload.studentName || meta.fullName;
        const enrollment = payload.enrollmentNumber || meta.enrollmentNumber;

        deviceState.set(markerKey, {
            sessionId: sessionId,
            studentId: studentId,
            studentName: fullName,
            enrollmentNumber: enrollment,
            deviceId: deviceId,
            markerKey: markerKey,
            deviceLabel: payload.deviceLabel || "Device",
            latitude: drawLat,
            longitude: drawLon,
            accuracy: accuracy,
            rawLatitude: payload.rawLatitude !== undefined ? Number(payload.rawLatitude) : lat,
            rawLongitude: payload.rawLongitude !== undefined ? Number(payload.rawLongitude) : lon,
            gpsCorrected: Boolean(payload.gpsCorrected),
            distance: distance,
            configuredRadius: configuredRadius,
            effectiveRadius: effectiveRadius,
            status: status,
            online: online,
            updatedAt: payload.updatedAt || new Date()
        });

        if (online) {
            const colors = getStatusColors(status);
            const initial = fullName.charAt(0).toUpperCase();
            
            // Custom circular div icon
            const markerIcon = L.divIcon({
                className: "custom-student-marker",
                html: `
                    <div style="width: 28px; height: 28px; background: #fff; border-radius: 50%; border: 3px solid ${colors.color}; box-shadow: 0 3px 8px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: ${colors.color}; font-family: sans-serif;">
                        ${initial}
                    </div>
                `,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });

            let marker = deviceMarkers.get(markerKey);

            if (marker) {
                if (stablePos.moved || stablePos.isFirst) {
                    marker.setLatLng([drawLat, drawLon]);
                }

                marker.setIcon(markerIcon);
            } else {
                marker = L.marker([drawLat, drawLon], {
                    icon: markerIcon,
                    title: fullName
                }).addTo(map);
                deviceMarkers.set(markerKey, marker);
            }

            let accuracyCircle = accuracyCircles.get(markerKey);
            const accuracyRadius = Math.max(Number(accuracy || 0), 8);

            if (accuracyCircle) {
                if (stablePos.moved || stablePos.isFirst) {
                    accuracyCircle.setLatLng([drawLat, drawLon]);
                }

                accuracyCircle.setRadius(accuracyRadius);
                accuracyCircle.setStyle({
                    color: colors.color,
                    fillColor: colors.color
                });
            } else {
                accuracyCircle = L.circle([drawLat, drawLon], {
                    radius: accuracyRadius,
                    color: colors.color,
                    weight: 1,
                    opacity: 0.35,
                    fillColor: colors.color,
                    fillOpacity: 0.08,
                    interactive: false
                }).addTo(map);
                accuracyCircles.set(markerKey, accuracyCircle);
            }

            const popupContent = `
                <div style="font-family: var(--shell-font, sans-serif); min-width: 180px;">
                    <div style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
                        <strong style="display: block; font-size: 15px; color: #0f172a;">${escapeHtml(fullName)}</strong>
                        <span style="font-size: 12px; color: #64748b;">${escapeHtml(enrollment || "No ID")}</span>
                    </div>
                    <div style="display: grid; gap: 6px; font-size: 13px; color: #334155;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Status:</span> <strong style="color: ${colors.color};">${colors.text}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>GPS Accuracy:</span> <strong>±${Math.round(accuracy || 0)}m</strong>
                        </div>
                        ${sessionId !== "global" ? `
                        <div style="display: flex; justify-content: space-between;">
                            <span>Distance:</span> <strong>${formatDistance(distance)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Base Radius:</span> <strong>${configuredRadius}m</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Effective Radius:</span> <strong>${effectiveRadius}m</strong>
                        </div>` : ""}
                    </div>
                        ${
                            payload.gpsCorrected
                                ? '<div style="margin-top:6px;font-size:11px;color:#0369a1;">GPS aligned with nearby verified devices (same location cluster).</div>'
                                : ""
                        }
                        <div style="margin-top: 8px; font-size: 11px; color: #94a3b8; text-align: right;">
                        Updated ${formatTime(payload.updatedAt || new Date())}
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent, { maxWidth: 260, offset: [0, -10] });
        } else {
            let marker = deviceMarkers.get(markerKey);
            if (marker) {
                marker.remove();
                deviceMarkers.delete(markerKey);
            }
            let accuracyCircle = accuracyCircles.get(markerKey);
            if (accuracyCircle) {
                accuracyCircle.remove();
                accuracyCircles.delete(markerKey);
            }
        }

        recalcCounts();
        renderRoster();

        if (!hasFitInitialDevices && deviceMarkers.size > 0) {
            hasFitInitialDevices = true;
            setTimeout(fitMapToLiveData, 120);
        }
    }

    function applySnapshot(snapshot) {
        if (!Array.isArray(snapshot)) return;
        for (let i = 0; i < snapshot.length; i++) upsertStudent(snapshot[i]);
    }

    function populateSessionSelect(sessions) {
        if (!sessionSelectEl) return;
        sessionSelectEl.innerHTML = "";
        
        const globalOption = document.createElement("option");
        globalOption.value = "global";
        globalOption.textContent = "Global College Map";
        sessionSelectEl.appendChild(globalOption);

        if (!sessions || !sessions.length) {
            sessionSelectEl.disabled = false;
            return;
        }

        sessionSelectEl.disabled = false;

        for (let i = 0; i < sessions.length; i++) {
            const row = sessions[i];
            const option = document.createElement("option");
            option.value = row.sessionId;
            option.textContent = (row.subjectName || "Session") + " · " + (row.classGroupName || "Class");
            sessionSelectEl.appendChild(option);
        }

        sessionSelectEl.onchange = function () {
            const nextId = sessionSelectEl.value;
            if (!nextId) return;

            removeDeviceLayers();
            rosterByStudent.clear();
            hasFitInitialDevices = false;
            if (rosterEl) {
                rosterEl.innerHTML = '<div class="teacher-map-roster-empty">Loading student devices…</div>';
            }

            watchSession(nextId);
        };
    }

    if (isSocketMode && socket) {
        socket.on("attendance:started:teacher", function (payload) {
            if (!payload || !payload.sessionId) return;
            setSessionCenter(payload);
            watchSession(payload.sessionId);
        });

        socket.on("teacher:watch-session:ok", function (payload) {
            if (!payload || !payload.sessionId) return;
            if (sessionSelectEl && sessionSelectEl.value !== String(payload.sessionId)) {
                sessionSelectEl.value = String(payload.sessionId);
            }

            applySessionPayload(payload);
        });

        socket.on("attendance:ended:teacher", function (payload) {
            if (!payload || !payload.sessionId) return;
            if (String(payload.sessionId) === activeSessionId) clearSession();
        });

        socket.on("student:location:update", function (payload) {
            upsertStudent(payload);
        });
        
        socket.on("disconnect", function () {
            if (activeSessionId) {
                startPollingSession(activeSessionId);
            }
        });

        socket.on("connect", function () {
            if (pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
            if (activeSessionId) {
                socket.emit("teacher:watch-session", { sessionId: activeSessionId });
            }
        });

        // When AUTO_ABSENT is overridden to PRESENT, update present/absent pill counters
        socket.on("attendance:record-updated", function (payload) {
            if (!payload || payload.newStatus !== "PRESENT") return;

            var sessionId = payload.sessionId ? String(payload.sessionId) : "";
            if (!sessionId) return;

            var card = document.querySelector(".live-card[data-session-id='" + sessionId + "']");
            if (!card) return;

            var presentEl = card.querySelector(".js-live-present-count");
            var absentEl = card.querySelector(".js-live-absent-count");

            if (presentEl) {
                var p = parseInt(presentEl.textContent, 10) || 0;
                presentEl.textContent = p + 1;
            }

            if (absentEl) {
                var a = parseInt(absentEl.textContent, 10) || 0;
                if (a > 0) absentEl.textContent = a - 1;
            }
        });
    }

    // Handle initial state
    const bootstrap = readBootstrap();
    populateSessionSelect(bootstrap);

    let initialSessionId = "global";
    if (bootstrap.length > 0) {
        initialSessionId = bootstrap[0].sessionId;
    } else {
        const firstLive = document.querySelector(".live-card[data-session-id]");
        if (firstLive) initialSessionId = firstLive.getAttribute("data-session-id") || "global";
    }

    if (sessionSelectEl) sessionSelectEl.value = initialSessionId;
    
    if (initialSessionId !== "global") {
        const bootRow = bootstrap.find(row => String(row.sessionId) === String(initialSessionId));
        if (bootRow) setSessionCenter(bootRow);
    } else {
        // Global map defaults
        activeSessionId = "global";
        if (mapOverlay) mapOverlay.style.display = "none";
        setHint("Showing all logged-in students in your college.");
    }
    
    watchSession(initialSessionId);
}

if (document.readyState !== "loading") {
    initTeacherLiveMap();
} else {
    document.addEventListener("DOMContentLoaded", initTeacherLiveMap);
}
