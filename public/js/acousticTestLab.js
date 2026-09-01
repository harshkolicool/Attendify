/**
 * Attendify Ultrasonic Acoustic Lab & Live Hardware Tester
 * Provides interactive test broadcast & receiver testing between Teacher & Student portals.
 */

(function(window) {
    "use strict";

    let teacherTestEmitter = null;
    let isTeacherBroadcasting = false;

    function escapeHtml(val) {
        return String(val || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- TEACHER LAB METHODS ---
    async function toggleTeacherAcousticTest() {
        // SYNCHRONOUS AUDIO ACTIVATION (Crucial for Chrome Autoplay Policy)
        let directAudioCtx = null;
        if (window.AttendifyAcousticRadar && typeof window.AttendifyAcousticRadar.getAudioContext === "function") {
            directAudioCtx = window.AttendifyAcousticRadar.getAudioContext();
            if (directAudioCtx && directAudioCtx.state === "suspended") {
                directAudioCtx.resume().catch(() => {});
            }
        }

        const btn = document.getElementById("btnTeacherAcousticTest");
        const statusBox = document.getElementById("teacherAcousticStatusBox");
        const tokenDisplay = document.getElementById("teacherAcousticCurrentToken");
        const emptyFeed = document.getElementById("teacherAcousticEmptyFeed");

        if (!btn) return;

        if (isTeacherBroadcasting) {
            // STOP TEST
            btn.disabled = true;
            try {
                await fetch("/teacher/acoustic-test/stop", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" }
                });
            } catch (e) {}

            if (teacherTestEmitter) {
                teacherTestEmitter.stopBroadcast();
                teacherTestEmitter = null;
            }
            isTeacherBroadcasting = false;

            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Test Beacon Broadcast';
            btn.classList.remove("active-stop");
            if (statusBox) statusBox.style.display = "none";
            return;
        }

        // START TEST
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing Beacon...';

        try {
            const res = await fetch("/teacher/acoustic-test/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const data = await res.json();

            if (!data.success || !data.token) {
                throw new Error(data.message || "Could not start test beacon.");
            }

            if (!window.AttendifyAcousticRadar || !window.AttendifyAcousticRadar.Emitter) {
                throw new Error("Acoustic Radar library not loaded.");
            }

            teacherTestEmitter = new window.AttendifyAcousticRadar.Emitter(directAudioCtx);
            const started = teacherTestEmitter.startBroadcast(data.token, 900);

            if (!started) {
                throw new Error("Could not initialize audio output context.");
            }

            isTeacherBroadcasting = true;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Test Beacon Broadcast';
            btn.classList.add("active-stop");

            if (tokenDisplay) tokenDisplay.textContent = data.token;
            if (statusBox) statusBox.style.display = "block";
            if (emptyFeed) emptyFeed.style.display = "block";

            // Attach socket listener for student verifications
            const socket = window.AttendifySharedSocket || (typeof io !== "undefined" ? io() : null);
            if (socket && !socket.__acousticTestAttached) {
                socket.__acousticTestAttached = true;
                socket.on("acoustic:test:student_verified", function(payload) {
                    onStudentAcousticVerified(payload);
                });
            }
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Test Beacon Broadcast';
            alert(err.message || "Failed to start test broadcast.");
        }
    }

    function onStudentAcousticVerified(payload) {
        const feed = document.getElementById("teacherAcousticReceiverFeed");
        const emptyFeed = document.getElementById("teacherAcousticEmptyFeed");
        if (!feed) return;

        if (emptyFeed) emptyFeed.style.display = "none";

        const card = document.createElement("div");
        card.className = "acoustic-verified-student-pill";
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        card.innerHTML = `
            <div class="pill-left">
                <span class="pill-check-icon"><i class="fa-solid fa-circle-check"></i></span>
                <div>
                    <strong>${escapeHtml(payload.studentName || "Student")}</strong>
                    <span class="pill-meta">${escapeHtml(payload.enrollmentNumber || "")} • Decoded Key: <code class="key-highlight">${escapeHtml(payload.decodedToken)}</code></span>
                </div>
            </div>
            <div class="pill-right">
                <span class="pill-dist"><i class="fa-solid fa-ruler-horizontal"></i> ${payload.distanceMeters}m (${escapeHtml(payload.rowCategory || "Classroom")})</span>
                <span class="pill-snr">SNR: ${payload.snr || "18.5"} dB</span>
                <span class="pill-time">${timeStr}</span>
            </div>
        `;

        feed.insertBefore(card, feed.firstChild);
    }

    // --- STUDENT TEST METHODS ---
    async function runStudentAcousticTest() {
        // SYNCHRONOUS AUDIO ACTIVATION
        let directAudioCtx = null;
        if (window.AttendifyAcousticRadar && typeof window.AttendifyAcousticRadar.getAudioContext === "function") {
            directAudioCtx = window.AttendifyAcousticRadar.getAudioContext();
            if (directAudioCtx && directAudioCtx.state === "suspended") {
                directAudioCtx.resume().catch(() => {});
            }
        }

        const btn = document.getElementById("btnStudentAcousticTest");
        const resultBox = document.getElementById("studentAcousticResultBox");
        if (!btn || !resultBox) return;

        const oldHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Listening to Speaker...';

        resultBox.style.display = "block";
        resultBox.className = "student-acoustic-result-box listening";
        resultBox.innerHTML = `
            <div class="acoustic-test-scanning">
                <div class="sonar-wave-anim">
                    <span class="sonar-ring r1"></span>
                    <span class="sonar-ring r2"></span>
                    <span class="sonar-ring r3"></span>
                    <i class="fa-solid fa-microphone text-purple"></i>
                </div>
                <div class="scanning-text">
                    <h4>Listening for Teacher's Ultrasonic Acoustic Chords...</h4>
                    <p id="studentLiveSpectrumMeter">Analyzing inaudible frequencies (18.0–19.6 kHz)...</p>
                </div>
            </div>
        `;

        const spectrumMeter = document.getElementById("studentLiveSpectrumMeter");

        try {
            if (!window.AttendifyAcousticRadar || !window.AttendifyAcousticRadar.Listener) {
                throw new Error("Acoustic Radar listener library not loaded.");
            }

            const listener = new window.AttendifyAcousticRadar.Listener(directAudioCtx);

            const proof = await listener.capturePresence(7500, function(spectrum) {
                if (spectrumMeter) {
                    const collectedDisplay = spectrum.collected
                        ? `Decoded Notes: <strong>[ ${spectrum.collected.split("").join(" ")} ]</strong>`
                        : `Listening for secret acoustic beacon...`;
                    spectrumMeter.innerHTML = `
                        ${collectedDisplay} <br>
                        <small style="color: #c084fc; font-family: monospace;">
                            Peak: ${spectrum.peakFreq} Hz | Signal Power: ${spectrum.power}/255 | Noise: ${spectrum.noise} | SNR: ${spectrum.snr}x
                        </small>
                    `;
                }
            });

            if (!proof.verified || !proof.decodedToken) {
                resultBox.className = "student-acoustic-result-box failed";
                resultBox.innerHTML = `
                    <div class="test-result-header error">
                        <i class="fa-solid fa-circle-xmark"></i>
                        <div>
                            <h4>No Ultrasonic Beacon Detected</h4>
                            <p>Could not capture complete acoustic chord sequence or speaker was silent.</p>
                        </div>
                    </div>
                    <div class="test-result-hint">
                        <strong>Quick Checklist:</strong>
                        <ul>
                            <li>Ensure the teacher clicked <strong>"Start Test Beacon Broadcast"</strong> on their laptop.</li>
                            <li>Make sure the teacher laptop speaker volume is turned up (≥ 60%).</li>
                            <li>Ensure you are in the same room (ultrasonic sound does not pass through walls).</li>
                        </ul>
                    </div>
                `;
                return;
            }

            // Step 2: Verify with server
            resultBox.innerHTML = `
                <div class="acoustic-test-scanning">
                    <div class="sonar-wave-anim">
                        <i class="fa-solid fa-satellite-dish text-purple fa-bounce"></i>
                    </div>
                    <div class="scanning-text">
                        <h4>Acoustic Sound Captured! Decoded Key: <code>${escapeHtml(proof.decodedToken)}</code></h4>
                        <p>Verifying decoded secret key with the database in real time...</p>
                    </div>
                </div>
            `;

            const verifyRes = await fetch("/student/acoustic-test/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    decodedToken: proof.decodedToken,
                    distanceMeters: proof.distanceMeters,
                    rowCategory: proof.rowCategory,
                    snr: proof.snr,
                    signalPower: proof.signalPower
                })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success && verifyData.verified) {
                resultBox.className = "student-acoustic-result-box success";
                resultBox.innerHTML = `
                    <div class="test-result-header success">
                        <div class="result-success-icon"><i class="fa-solid fa-circle-check"></i></div>
                        <div>
                            <h4>✅ ULTRASONIC PRESENCE 100% VERIFIED!</h4>
                            <p>Physical acoustic presence confirmed in the classroom.</p>
                        </div>
                    </div>
                    <div class="test-result-metrics-grid">
                        <div class="metric-card">
                            <span class="m-label">Decoded Key</span>
                            <strong class="m-val key-badge">${escapeHtml(verifyData.decodedToken)}</strong>
                            <small class="m-sub">Matches Server DB ✓</small>
                        </div>
                        <div class="metric-card">
                            <span class="m-label">Estimated Seating</span>
                            <strong class="m-val">${verifyData.distanceMeters}m</strong>
                            <small class="m-sub">${escapeHtml(verifyData.rowCategory || "Classroom")}</small>
                        </div>
                        <div class="metric-card">
                            <span class="m-label">Signal Quality</span>
                            <strong class="m-val">${verifyData.snr || "18.5"} dB</strong>
                            <small class="m-sub">Power: ${verifyData.signalPower || 200}/255</small>
                        </div>
                    </div>
                    <div class="test-result-success-note">
                        <i class="fa-solid fa-shield-halved"></i> Real-time notification sent to Teacher's screen!
                    </div>
                `;
            } else {
                resultBox.className = "student-acoustic-result-box failed";
                resultBox.innerHTML = `
                    <div class="test-result-header error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <div>
                            <h4>Acoustic Verification Failed</h4>
                            <p>${escapeHtml(verifyData.message || "Decoded token does not match active teacher beacon.")}</p>
                        </div>
                    </div>
                    <div class="test-result-metrics-grid">
                        <div class="metric-card">
                            <span class="m-label">Heard by Mic</span>
                            <strong class="m-val key-badge">${escapeHtml(verifyData.decodedToken || "—")}</strong>
                        </div>
                        <div class="metric-card">
                            <span class="m-label">Expected in DB</span>
                            <strong class="m-val">${escapeHtml(verifyData.expectedToken || "—")}</strong>
                        </div>
                    </div>
                `;
            }
        } catch (err) {
            resultBox.className = "student-acoustic-result-box failed";
            resultBox.innerHTML = `
                <div class="test-result-header error">
                    <i class="fa-solid fa-circle-xmark"></i>
                    <div>
                        <h4>Microphone Error</h4>
                        <p>${escapeHtml(err.message || "Could not access microphone.")}</p>
                    </div>
                </div>
            `;
        } finally {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
        }
    }

    window.toggleTeacherAcousticTest = toggleTeacherAcousticTest;
    window.runStudentAcousticTest = runStudentAcousticTest;

})(window);
