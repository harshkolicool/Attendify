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
        mapEl.innerHTML = '<div class="teacher-map-disabled"><div class="teacher-map-disabled-inner"><i class="fa-solid fa-satellite" aria-hidden="true"></i><p>Live map updates are disabled.</p></div></div>';
        const rosterEl = document.getElementById("teacherMapRoster");
        if (rosterEl) {
            rosterEl.innerHTML = '<div class="teacher-map-roster-empty">Live location tracking is disabled.</div>';
        }
        return;
    }

    if (isSocketMode && typeof io === "undefined") {
        setTimeout(initTeacherLiveMap, 50);
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

    // Live Analytics Chart


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
    let studentClusterGroup = null;

    function getMarkerStabilizer(markerKey) {
        if (!window.AttendifyLocationStabilizer) {
            return null;
        }

        if (!markerStabilizers.has(markerKey)) {
            markerStabilizers.set(
                markerKey,
                window.AttendifyLocationStabilizer.create({
                    minMoveMeters: 8,
                    accuracyRatio: 0.6,
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

        const stable = stabilizer.update(lat, lon, accuracy);

        // If accuracy is highly precise (like Google Maps), bypass the EMA dragging effect
        // and instantly track the true physical location.
        if (accuracy && accuracy <= 10) {
            return { lat: lat, lon: lon, moved: true, isFirst: stable.isFirst };
        }

        return stable;
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
                const s = device.status;
                if (s === "INSIDE" || s === "PRESENT" || s === "PRESENT_STRONG" || s === "PRESENT_WEAK_GPS" || s === "PRESENT_AUTO") {
                    inside++;
                } else if (s === "NEAR") {
                    near++;
                } else if (s === "OUTSIDE" || s === "OUTSIDE_REJECTED" || s === "REJECTED") {
                    outside++;
                } else if (s === "POOR_ACCURACY" || s === "GPS_RETRY_REQUIRED") {
                    poor++;
                }
            }
        });

        if (insidePill) insidePill.textContent = inside + " inside";
        if (nearPill) nearPill.textContent = near + " near";
        if (outsidePill) outsidePill.textContent = outside + " outside";
        if (poorPill) poorPill.textContent = poor + " poor GPS";
        if (trackingPill) trackingPill.textContent = onlineDevices + " live";


    }

    let currentTileLayer = null;

    function applyMapTheme() {
        if (!map) return;
        if (!currentTileLayer) {
            currentTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }
    }

    function getInitialCenterCoords() {
        if (mapEl) {
            const rawCenter = mapEl.getAttribute("data-default-center");
            if (rawCenter) {
                try {
                    const parsed = JSON.parse(rawCenter);
                    if (parsed && parsed.latitude && parsed.longitude && Number(parsed.latitude) !== 0) {
                        return { lat: Number(parsed.latitude), lon: Number(parsed.longitude), zoom: 16, name: parsed.name || "Campus Classroom", radius: Number(parsed.radius || 100) };
                    }
                } catch (e) {}
            }
        }

        const boot = readBootstrap();
        if (boot.length > 0 && boot[0].latitude && boot[0].longitude && Number(boot[0].latitude) !== 0) {
            return { lat: Number(boot[0].latitude), lon: Number(boot[0].longitude), zoom: 17, name: boot[0].subjectName, radius: Number(boot[0].radius || 100) };
        }

        return { lat: 28.6139, lon: 77.2090, zoom: 15, name: "Campus", radius: 100 };
    }

    let standbyCircle = null;
    let standbyMarker = null;

    function drawStandbyCampusCircle(initial) {
        if (!map || !initial || !initial.lat || !initial.lon || initial.lat === 0) return;
        if (standbyCircle) {
            try { standbyCircle.remove(); } catch (e) {}
        }
        if (standbyMarker) {
            try { standbyMarker.remove(); } catch (e) {}
        }

        standbyCircle = L.circle([initial.lat, initial.lon], {
            radius: initial.radius || 100,
            color: '#6366f1',
            fillColor: '#6366f1',
            fillOpacity: 0.12,
            weight: 2,
            dashArray: '6, 8'
        }).addTo(map);

        const campusIcon = L.divIcon({
            className: "custom-campus-marker",
            html: '<div class="teacher-map-center-marker" style="background: linear-gradient(135deg, #6366f1, #4f46e5); box-shadow: 0 0 16px rgba(99,102,241,0.6);"><i class="fa-solid fa-location-dot"></i></div>',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        standbyMarker = L.marker([initial.lat, initial.lon], {
            icon: campusIcon
        }).addTo(map);

        standbyMarker.bindPopup("<b>" + escapeHtml(initial.name) + "</b><br><small style='color: #6366f1; font-weight: 700;'>Campus Location • Geofence Ready</small>");
    }

    let userLiveGpsMarker = null;
    let userLiveGpsCircle = null;

    function requestTeacherLiveGps(autoCenter) {
        if (!navigator.geolocation) {
            console.warn("Geolocation not supported by browser.");
            return;
        }

        const locateBtn = document.getElementById("teacherMapLocateBtn");
        if (locateBtn) {
            locateBtn.classList.add("loading");
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                if (locateBtn) locateBtn.classList.remove("loading");
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const accuracy = pos.coords.accuracy || 20;

                window.teacherLiveLocation = { lat: lat, lon: lon, accuracy: accuracy };

                // Auto-fill hidden inputs on start attendance forms
                document.querySelectorAll(".js-teacher-start-form").forEach(function(f) {
                    const latInput = f.querySelector("input[name='teacherLatitude']");
                    const lonInput = f.querySelector("input[name='teacherLongitude']");
                    const accInput = f.querySelector("input[name='teacherAccuracy']");
                    if (latInput) latInput.value = lat;
                    if (lonInput) lonInput.value = lon;
                    if (accInput) accInput.value = accuracy;
                });

                if (!map) return;

                // Remove generic standby circle/marker if any
                if (standbyCircle) {
                    try { standbyCircle.remove(); } catch (e) {}
                    standbyCircle = null;
                }
                if (standbyMarker) {
                    try { standbyMarker.remove(); } catch (e) {}
                    standbyMarker = null;
                }

                // If an active session is already rendering, keep and focus the unified teacher marker
                if (activeSessionId && sessionCenter) {
                    if (userLiveGpsMarker) { try { userLiveGpsMarker.remove(); } catch (e) {} userLiveGpsMarker = null; }
                    if (userLiveGpsCircle) { try { userLiveGpsCircle.remove(); } catch (e) {} userLiveGpsCircle = null; }

                    const teacherIcon = L.divIcon({
                        className: "custom-teacher-marker",
                        html: '<div class="teacher-map-center-marker teacher-live-beacon"><span class="beacon-halo"></span><i class="fa-solid fa-chalkboard-user"></i></div>',
                        iconSize: [36, 36],
                        iconAnchor: [18, 18]
                    });

                    if (teacherMarker) {
                        teacherMarker.setLatLng([sessionCenter.lat, sessionCenter.lon]);
                        teacherMarker.setIcon(teacherIcon);
                    } else {
                        teacherMarker = L.marker([sessionCenter.lat, sessionCenter.lon], {
                            icon: teacherIcon,
                            title: "Teacher Location",
                            zIndexOffset: 1000
                        }).addTo(map);
                    }

                    teacherMarker.bindPopup(
                        "<b>Teacher / Session Center</b><br><small style='color: #059669; font-weight: 700;'>GPS Accuracy: ±" + Math.round(accuracy) + "m</small><br>Allowed Radius: " + Math.round(sessionCenter.radius) + "m"
                    );

                    if (autoCenter) {
                        map.flyTo([sessionCenter.lat, sessionCenter.lon], 17, { animate: true, duration: 1.2 });
                        setTimeout(function() {
                            if (teacherMarker) teacherMarker.openPopup();
                        }, 1200);
                    }
                    setHint("Teacher Location verified (±" + Math.round(accuracy) + "m). Geofence boundary active.");
                    return;
                }

                // If in standby mode (NO active session), clean up old teacher marker
                if (teacherMarker) {
                    try { teacherMarker.remove(); } catch (e) {}
                    teacherMarker = null;
                }

                // Draw / update Standby Live Teacher GPS marker when NO session is running
                if (userLiveGpsMarker) {
                    try { userLiveGpsMarker.remove(); } catch (e) {}
                }
                if (userLiveGpsCircle) {
                    try { userLiveGpsCircle.remove(); } catch (e) {}
                }

                userLiveGpsCircle = L.circle([lat, lon], {
                    radius: Math.max(accuracy, 30),
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 0.15,
                    weight: 2
                }).addTo(map);

                const teacherIcon = L.divIcon({
                    className: "custom-teacher-marker",
                    html: '<div class="teacher-map-center-marker teacher-live-beacon"><span class="beacon-halo"></span><i class="fa-solid fa-chalkboard-user"></i></div>',
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });

                userLiveGpsMarker = L.marker([lat, lon], {
                    icon: teacherIcon,
                    zIndexOffset: 1000
                }).addTo(map);

                userLiveGpsMarker.bindPopup(
                    "<b>Your Live Location</b><br><small style='color: #059669; font-weight: 700;'>GPS Accuracy: ±" + Math.round(accuracy) + "m</small>"
                );

                if (autoCenter) {
                    map.flyTo([lat, lon], 17, {
                        animate: true,
                        duration: 1.2
                    });
                    setTimeout(function() {
                        if (userLiveGpsMarker) userLiveGpsMarker.openPopup();
                    }, 1200);
                }

                setHint("Teacher GPS acquired (±" + Math.round(accuracy) + "m). Ready to verify student proximity.");
            },
            function (err) {
                if (locateBtn) locateBtn.classList.remove("loading");
                console.warn("Teacher location error:", err.message);
                setHint("Click 'Locate Me' and allow browser location access to pinpoint your position.");
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    }

    // Always initialize map
    if (!mapInitialized) {
        const initial = getInitialCenterCoords();
        map = L.map(mapEl, {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView([initial.lat, initial.lon], initial.zoom);

        applyMapTheme();

        const bootstrapData = readBootstrap();
        if (bootstrapData.length === 0) {
            drawStandbyCampusCircle(initial);
            // Proactively request teacher's actual GPS
            requestTeacherLiveGps(true);
        }

        // Listen for theme toggles to switch tiles dynamically
        const themeObserver = new MutationObserver(function() {
            applyMapTheme();
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        window.addEventListener('attendify:theme-changed', applyMapTheme);

        const locateBtn = document.getElementById("teacherMapLocateBtn");
        if (locateBtn) {
            locateBtn.addEventListener("click", function (e) {
                e.preventDefault();
                requestTeacherLiveGps(true);
            });
        }

        if (typeof L.markerClusterGroup !== "undefined") {
            studentClusterGroup = L.markerClusterGroup({
                maxClusterRadius: 40,
                disableClusteringAtZoom: 20,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false
            });
            map.addLayer(studentClusterGroup);
            
            window.seatClusterGroup = L.markerClusterGroup({
                maxClusterRadius: 20,
                disableClusteringAtZoom: 22,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false
            });
            map.addLayer(window.seatClusterGroup);
        }

        mapInitialized = true;
        
        setTimeout(function() {
            if (map) map.invalidateSize();
        }, 300);
        
        // Recalculate map size after window resize OR sidebar toggle OR orientation change
        function invalidateMap() {
            if (map) map.invalidateSize();
        }
        window.addEventListener('resize', invalidateMap);
        window.addEventListener('orientationchange', invalidateMap);
        window.addEventListener('attendify:layout-changed', invalidateMap);

        if (window.ResizeObserver && mapEl) {
            const ro = new ResizeObserver(function() {
                if (map) map.invalidateSize();
            });
            ro.observe(mapEl);
            const wrap = mapEl.closest('.teacher-map-wrapper');
            if (wrap) ro.observe(wrap);
        }
    }

    function removeDeviceLayers() {
        if (studentClusterGroup) {
            studentClusterGroup.clearLayers();
        }
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
        if (!map) return;

        const bounds = L.latLngBounds([]);

        if (radiusCircle && typeof radiusCircle.getBounds === "function") {
            bounds.extend(radiusCircle.getBounds());
        } else if (sessionCenter) {
            bounds.extend([sessionCenter.lat, sessionCenter.lon]);
        } else if (window.teacherLiveLocation) {
            bounds.extend([window.teacherLiveLocation.lat, window.teacherLiveLocation.lon]);
        }

        deviceMarkers.forEach(function (marker) {
            try {
                bounds.extend(marker.getLatLng());
            } catch (e) {
                // ignore
            }
        });

        if (!bounds.isValid()) {
            centerOnSession();
            return;
        }

        map.fitBounds(bounds, {
            padding: [36, 36],
            maxZoom: deviceMarkers.size > 0 ? 19 : 18,
            animate: true
        });
    }

    function centerOnSession() {
        if (!map) return;

        if (sessionCenter) {
            map.flyTo([sessionCenter.lat, sessionCenter.lon], 18, {
                animate: true
            });

            if (teacherMarker) {
                teacherMarker.openPopup();
            }
        } else if (window.teacherLiveLocation) {
            map.flyTo([window.teacherLiveLocation.lat, window.teacherLiveLocation.lon], 17, {
                animate: true
            });
            if (userLiveGpsMarker) {
                userLiveGpsMarker.openPopup();
            }
        } else {
            requestTeacherLiveGps(true);
        }
    }

    function addSeatMarker(sessionId, studentId, fullName, lat, lon) {
        if (!window.seatClusterGroup || !map || sessionId !== activeSessionId || !studentId || !lat || !lon) return;

        const seatIcon = L.divIcon({
            className: "custom-seat-marker",
            html: '<div class="teacher-map-seat-marker"><i class="fa-solid fa-chair"></i></div>',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        // Check if marker exists to avoid duplicates
        const existingMarkers = window.seatClusterGroup.getLayers();
        for (let i = 0; i < existingMarkers.length; i++) {
            if (existingMarkers[i].options && existingMarkers[i].options.studentId === studentId) {
                // If it already exists, don't drop another one
                return;
            }
        }

        const marker = L.marker([lat, lon], {
            icon: seatIcon,
            zIndexOffset: 500, // Show above live dots
            studentId: studentId // custom property
        });

        marker.bindTooltip("<b>" + escapeHtml(fullName) + "</b><br><small>Marked Present</small>", {
            direction: 'top',
            offset: [0, -10]
        });

        window.seatClusterGroup.addLayer(marker);
    }

    // Expose globally so teacherRealtime.js can call it on attendance:marked
    window.addSeatMarker = addSeatMarker;

    function applySeatMap(seatMap, sessionId) {
        if (!window.seatClusterGroup) return;
        window.seatClusterGroup.clearLayers();
        
        if (!Array.isArray(seatMap)) return;
        
        for (let i = 0; i < seatMap.length; i++) {
            const sm = seatMap[i];
            addSeatMarker(sessionId, sm.studentId, sm.fullName, sm.latitude, sm.longitude);
        }
    }

    function applySessionPayload(payload) {
        if (!payload || !payload.sessionId) return;

        seedRoster(payload.roster);
        setSessionCenter(payload);
        applySnapshot(payload.snapshot || []);
        applySeatMap(payload.seatMap || [], payload.sessionId);
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

        if (userLiveGpsMarker) { try { userLiveGpsMarker.remove(); } catch (e) {} userLiveGpsMarker = null; }
        if (userLiveGpsCircle) { try { userLiveGpsCircle.remove(); } catch (e) {} userLiveGpsCircle = null; }
        if (standbyMarker) { try { standbyMarker.remove(); } catch (e) {} standbyMarker = null; }
        if (standbyCircle) { try { standbyCircle.remove(); } catch (e) {} standbyCircle = null; }

        const teacherIcon = L.divIcon({
            className: "custom-teacher-marker",
            html: '<div class="teacher-map-center-marker teacher-live-beacon"><span class="beacon-halo"></span><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i></div>',
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        if (teacherMarker) {
            teacherMarker.setLatLng([lat, lon]);
            teacherMarker.setIcon(teacherIcon);
        } else {
            teacherMarker = L.marker([lat, lon], { icon: teacherIcon, title: "Teacher Location", zIndexOffset: 1000 }).addTo(map);
        }

        teacherMarker.bindPopup(
            "<b>Teacher / Classroom Center</b><br>Attendance Radius: " +
                Math.round(adminRadius) +
                " m<br>GPS verification zone: " +
                Math.round(verificationRadius) +
                " m"
        );

        if (radiusCircle) {
            radiusCircle.setLatLng([lat, lon]);
            radiusCircle.setRadius(adminRadius);
        } else {
            radiusCircle = L.circle([lat, lon], {
                radius: adminRadius,
                color: "#f59e0b",
                weight: 2,
                fillColor: "#f59e0b",
                fillOpacity: 0.06,
                dashArray: "5, 8"
            }).addTo(map);
        }

        if (effectiveRadiusCircle) {
            effectiveRadiusCircle.setLatLng([lat, lon]);
            effectiveRadiusCircle.setRadius(verificationRadius);
        } else {
            effectiveRadiusCircle = L.circle([lat, lon], {
                radius: verificationRadius,
                color: "#10b981",
                weight: 2.5,
                fillColor: "#10b981",
                fillOpacity: 0.14
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
        if (status === "PRESENT" || status === "PRESENT_STRONG" || status === "PRESENT_WEAK_GPS" || status === "PRESENT_AUTO" || status === "INSIDE" || status === "NEAR") {
            return { key: "inside", color: "#16a34a", text: "PRESENT" };
        }
        if (status === "ABSENT") {
            return { key: "offline", color: "#94a3b8", text: "ABSENT" };
        }
        if (status === "OUTSIDE_REJECTED" || status === "REJECTED" || status === "OUTSIDE") {
            return { key: "outside", color: "#dc2626", text: "OUTSIDE REJECTED" };
        }
        if (status === "GPS_RETRY_REQUIRED" || status === "POOR_ACCURACY") {
            return { key: "poor", color: "#d97706", text: "GPS RETRY REQUIRED" };
        }
        if (status === "STALE_OFFLINE" || status === "OFFLINE" || status === "NO_DATA") {
            return { key: "offline", color: "#64748b", text: "STALE OFFLINE" };
        }
        return { key: "online", color: "#22c55e", text: "ONLINE" };
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
            
            const c = isOnline ? getStatusColors(row.status) : { key: "offline", color: "#94a3b8", text: "Offline" };
            const markerAttr = row.latest && isOnline
                ? ' data-marker-key="' + escapeHtml(row.latest.markerKey || "") + '" tabindex="0" role="button"'
                : "";
            
            let details = "";
            if (row.latest && isOnline) {
                const dist = row.latest.distance;
                const acc = Math.round(row.latest.accuracy || 0);
                const status = row.latest.status;

                // When Inside or Near, the raw GPS-to-GPS distance is misleading:
                // two devices at the same physical spot can differ by 20-50m indoors.
                // Show GPS drift context instead of a bare distance number.
                let distanceText;
                if (status === "INSIDE") {
                    distanceText = acc > 0
                        ? `GPS drift ~${Math.round(dist)}m <span style="opacity:0.6;font-size:11px">(GPS ±${acc}m)</span>`
                        : "Inside zone ✓";
                } else if (status === "NEAR") {
                    distanceText = `~${Math.round(dist)}m <span style="opacity:0.6;font-size:11px">(near boundary, GPS ±${acc}m)</span>`;
                } else {
                    distanceText = formatDistance(dist);
                }

                details = `
                    <div class="teacher-map-device-metrics">
                        <span class="teacher-map-distance-row"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i> ${distanceText}</span>
                        <span class="teacher-map-accuracy-row"><i class="fa-solid fa-satellite-dish" aria-hidden="true"></i> ±${acc}m GPS</span>
                    </div>
                    <div class="teacher-map-last-seen">Last: ${escapeHtml(formatTime(row.latest.updatedAt))}</div>
                `;
            }

            return `
                <article class="teacher-map-student-card teacher-map-status-${c.key} ${isOnline ? "is-live" : ""}"${markerAttr}>
                    <div class="teacher-map-student-top">
                        <div class="teacher-map-avatar teacher-map-avatar-${c.key}">
                            ${initial}
                        </div>
                        <div class="teacher-map-student-copy">
                            <div class="teacher-map-student-head">
                                <strong>${escapedName}</strong>
                                <span class="teacher-map-device-status teacher-map-device-status-${c.key}">${c.text}</span>
                            </div>
                            <p>${escapedEnrollment}</p>
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
                html: `<div class="teacher-map-device-marker teacher-map-device-marker-${colors.key}"><span>${initial}</span></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Determine z-index: Teacher is 1000, Inside is 500, Near is 400, Outside/Poor is 300
            let zIndex = 300;
            if (status === "INSIDE") zIndex = 500;
            else if (status === "NEAR") zIndex = 400;

            let marker = deviceMarkers.get(markerKey);

            if (marker) {
                if (stablePos.moved || stablePos.isFirst) {
                    marker.setLatLng([drawLat, drawLon]);
                }

                marker.setIcon(markerIcon);
                marker.setZIndexOffset(zIndex);
            } else {
                marker = L.marker([drawLat, drawLon], {
                    icon: markerIcon,
                    title: fullName,
                    zIndexOffset: zIndex
                });
                
                if (studentClusterGroup) {
                    studentClusterGroup.addLayer(marker);
                } else {
                    marker.addTo(map);
                }
                
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
                <div class="teacher-map-popup">
                    <div class="teacher-map-popup-head">
                        <strong>${escapeHtml(fullName)}</strong>
                        <span>${escapeHtml(enrollment || "No ID")}</span>
                    </div>
                    <div class="teacher-map-popup-grid">
                        <div class="teacher-map-popup-row">
                            <span>Status:</span> <strong class="teacher-map-popup-status teacher-map-popup-status-${colors.key}">${colors.text}</strong>
                        </div>
                        <div class="teacher-map-popup-row">
                            <span>GPS Accuracy:</span> <strong>±${Math.round(accuracy || 0)}m</strong>
                        </div>
                        ${sessionId !== "global" ? `
                        <div class="teacher-map-popup-row">
                            <span>Distance:</span> <strong>${formatDistance(distance)}</strong>
                        </div>
                        <div class="teacher-map-popup-row">
                            <span>Base Radius:</span> <strong>${configuredRadius}m</strong>
                        </div>
                        <div class="teacher-map-popup-row">
                            <span>Effective Radius:</span> <strong>${effectiveRadius}m</strong>
                        </div>` : ""}
                    </div>
                        ${
                            payload.gpsCorrected
                                ? '<div class="teacher-map-popup-gps-note">GPS aligned with nearby verified devices (same location cluster).</div>'
                                : ""
                        }
                        <div class="teacher-map-popup-updated">
                        Updated ${formatTime(payload.updatedAt || new Date())}
                    </div>
                </div>
            `;
            marker.bindPopup(popupContent, { maxWidth: 260, offset: [0, -10] });
        } else {
            let marker = deviceMarkers.get(markerKey);
            if (marker) {
                if (studentClusterGroup) {
                    studentClusterGroup.removeLayer(marker);
                }
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

        socket.on("attendance:radius:updated", function (payload) {
            if (!payload || !payload.sessionId) return;
            if (activeSessionId && String(payload.sessionId) !== activeSessionId) return;

            var newRadius = Number(payload.radius || payload.effectiveRadius || payload.configuredRadius);
            if (newRadius > 0) {
                if (sessionCenter) {
                    sessionCenter.radius = newRadius;
                    sessionCenter.verificationRadius = newRadius;
                }
                if (radiusCircle) {
                    radiusCircle.setRadius(newRadius);
                }
                if (effectiveRadiusCircle) {
                    effectiveRadiusCircle.setRadius(newRadius);
                }
                if (teacherMarker) {
                    teacherMarker.bindPopup(
                        "<b>Teacher / Classroom Center</b><br>Attendance Radius: " +
                            Math.round(newRadius) + " m"
                    );
                }
                setHint("Attendance radius updated to " + Math.round(newRadius) + "m by Admin.");
            }
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
