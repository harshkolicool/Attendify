/**
 * Attendify Ultra-Modern Landing Experience (v7)
 * Cartographic map simulation, in-card biometric scanning, acoustic radar, and continuous live stream telemetry.
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Mobile Menu Toggle
    const menuButton = document.getElementById("homeMenuBtn");
    const navLinks = document.getElementById("homeNavLinks");

    if (menuButton && navLinks) {
        function syncMenuUi(isOpen) {
            navLinks.classList.toggle("open", isOpen);
            menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
            const icon = menuButton.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-bars", !isOpen);
                icon.classList.toggle("fa-xmark", isOpen);
            }
        }

        menuButton.addEventListener("click", function (e) {
            e.stopPropagation();
            syncMenuUi(!navLinks.classList.contains("open"));
        });

        // Close menu on outside click
        document.addEventListener("click", function (e) {
            if (navLinks.classList.contains("open") && !navLinks.contains(e.target) && !menuButton.contains(e.target)) {
                syncMenuUi(false);
            }
        });

        // Close menu on nav link click (mobile)
        navLinks.addEventListener("click", function (e) {
            if (e.target && (e.target.tagName === "A" || e.target.closest("a")) && window.innerWidth <= 1120) {
                syncMenuUi(false);
            }
        });

        // Close menu on Escape key
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && navLinks.classList.contains("open")) {
                syncMenuUi(false);
                menuButton.focus();
            }
        });

        // Close on resize to desktop
        window.addEventListener("resize", function () {
            if (window.innerWidth > 1120 && navLinks.classList.contains("open")) {
                syncMenuUi(false);
            }
        });
    }


    // 2. Dashboard View Switcher Tabs
    const viewTabs = document.querySelectorAll(".dash-pill-tab");
    const viewScreens = document.querySelectorAll(".dash-view-screen");

    viewTabs.forEach(tab => {
        tab.addEventListener("click", function () {
            const targetView = this.getAttribute("data-view");

            viewTabs.forEach(t => t.classList.remove("active"));
            viewScreens.forEach(s => s.classList.remove("active"));

            this.classList.add("active");
            const activeScreen = document.getElementById("dashView-" + targetView);
            if (activeScreen) {
                activeScreen.classList.add("active");
            }
        });
    });

    // 3. Vector Map "Test My Attendance" Simulator
    const btnSimulate = document.getElementById("btnSimulateCheckin");
    const userPin = document.getElementById("simulatedUserPin");
    const counterDisplay = document.getElementById("liveAttendanceCounter");
    const progressBar = document.getElementById("liveAttendanceProgressBar");
    const telemetryStream = document.getElementById("telemetryLogStream");

    let isUserVerified = false;

    if (btnSimulate && userPin && counterDisplay && progressBar) {
        btnSimulate.addEventListener("click", function () {
            if (!isUserVerified) {
                isUserVerified = true;
                userPin.style.display = "flex";
                counterDisplay.textContent = "45 / 50 Present (90%)";
                counterDisplay.style.color = "#34d399";
                progressBar.style.width = "90%";
                this.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> You Are Verified!`;
                this.style.borderColor = "#10b981";
                this.style.background = "rgba(16, 185, 129, 0.2)";
                this.style.color = "#34d399";

                if (telemetryStream) {
                    const now = new Date();
                    const timeStr = now.toTimeString().split(" ")[0];
                    const newLog = document.createElement("div");
                    newLog.className = "log-row verified";
                    newLog.style.background = "rgba(6, 182, 212, 0.15)";
                    newLog.style.border = "1px solid rgba(6, 182, 212, 0.4)";
                    newLog.innerHTML = `
                        <span class="log-time">${timeStr}</span>
                        <span class="log-badge pass" style="background:#06b6d4; color:#042f2e;">YOU</span>
                        <span class="log-desc">Student Check-In Verified • GPS: 4.5m inside geofence • FIDO2 Passkey ✓</span>
                    `;
                    telemetryStream.insertBefore(newLog, telemetryStream.firstChild);
                }
            } else {
                // Toggle reset
                isUserVerified = false;
                userPin.style.display = "none";
                counterDisplay.textContent = "44 / 50 Present (88%)";
                counterDisplay.style.color = "#ffffff";
                progressBar.style.width = "88%";
                this.innerHTML = `<i class="fa-solid fa-location-arrow"></i> Test My Attendance`;
                this.style.borderColor = "rgba(6, 182, 212, 0.4)";
                this.style.background = "rgba(6, 182, 212, 0.15)";
                this.style.color = "#38bdf8";
            }
        });
    }

    // 4. In-Card Biometric Scanner Interaction
    const touchTarget = document.getElementById("modernTouchTarget");
    const laserBeam = document.getElementById("scannerLaserBeam");
    const helperText = document.getElementById("scannerHelperText");
    const cryptoConsole = document.getElementById("cryptoTerminalStream");

    if (touchTarget && laserBeam && cryptoConsole) {
        touchTarget.addEventListener("click", function () {
            laserBeam.classList.remove("active");
            void laserBeam.offsetWidth; // trigger reflow
            laserBeam.classList.add("active");

            const fpSvg = this.querySelector(".scanner-fp-svg");
            if (fpSvg) {
                fpSvg.style.color = "#10b981";
                fpSvg.style.transform = "scale(1.15)";
            }

            if (helperText) {
                helperText.textContent = "Authenticating with Secure Enclave...";
                helperText.style.color = "#34d399";
            }

            cryptoConsole.innerHTML = `
                <div class="term-row"><span class="c-dim">[WEBAUTHN]</span> 32-Byte challenge received from server: 0x8f2a7b1c...</div>
                <div class="term-row"><span class="c-emerald">[ENCLAVE]</span> Biometric verified! ECDSA P-256 signature generated (0.32s) ✓</div>
                <div class="term-row"><span class="c-cyan">[TOKEN]</span> Single-use Attendance Token issued: #att_` + Math.random().toString(36).substring(2, 9) + `</div>
            `;

            setTimeout(() => {
                if (fpSvg) {
                    fpSvg.style.color = "#38bdf8";
                    fpSvg.style.transform = "scale(1)";
                }
                if (helperText) {
                    helperText.textContent = "Hardware Biometrics Verified ✓";
                    helperText.style.color = "#38bdf8";
                }
            }, 1300);
        });
    }

    // 5. In-Card Acoustic Radar Interaction
    const sonarTarget = document.getElementById("acousticSonarTarget");
    const sonarHelperText = document.getElementById("acousticHelperText");
    const seatingBadge = document.getElementById("acousticSeatingBadge");
    const spectrumBars = document.querySelectorAll(".spectrum-bar");

    const seatingPresets = [
        { label: "Front Row (1.2m)", color: "#10b981", border: "rgba(16, 185, 129, 0.4)", bg: "rgba(16, 185, 129, 0.15)", icon: "fa-chair", rssi: "-38 dBm" },
        { label: "Middle Row (3.8m)", color: "#38bdf8", border: "rgba(6, 182, 212, 0.4)", bg: "rgba(6, 182, 212, 0.15)", icon: "fa-users-line", rssi: "-58 dBm" },
        { label: "Back Row (7.5m)", color: "#a855f7", border: "rgba(168, 85, 247, 0.4)", bg: "rgba(168, 85, 247, 0.15)", icon: "fa-chair", rssi: "-74 dBm" }
    ];
    let seatingIdx = 0;

    if (sonarTarget) {
        sonarTarget.addEventListener("click", function () {
            if (sonarHelperText) {
                sonarHelperText.textContent = "BROADCASTING 2-FSK...";
                sonarHelperText.style.color = "#38bdf8";
            }

            // Realistic channel-specific FFT peak heights
            const channelPeaks = [
                () => Math.floor(Math.random() * 12) + 10,   // 18.0k cutoff
                () => Math.floor(Math.random() * 12) + 84,   // 18.6k PILOT
                () => Math.floor(Math.random() * 15) + 12,   // 19.0k guard
                () => Math.floor(Math.random() * 20) + 72,   // 19.2k BIT 0
                () => Math.floor(Math.random() * 14) + 12,   // 19.5k guard
                () => Math.floor(Math.random() * 15) + 82,   // 19.8k BIT 1
                () => Math.floor(Math.random() * 10) + 8     // 20.0k edge
            ];

            spectrumBars.forEach((bar, idx) => {
                const getH = channelPeaks[idx] || (() => Math.floor(Math.random() * 40) + 20);
                bar.style.height = getH() + "%";
            });

            setTimeout(() => {
                seatingIdx = (seatingIdx + 1) % seatingPresets.length;
                const preset = seatingPresets[seatingIdx];

                if (seatingBadge) {
                    seatingBadge.innerHTML = `<i class="fa-solid ${preset.icon}" style="color:${preset.color}"></i> <span class="seating-label-text">${preset.label}</span>`;
                    seatingBadge.style.color = preset.color;
                    seatingBadge.style.borderColor = preset.border;
                    seatingBadge.style.background = preset.bg;
                    seatingBadge.style.boxShadow = `0 0 14px ${preset.border}`;
                }

                if (sonarHelperText) {
                    sonarHelperText.textContent = "CHIRP CAPTURED ✓";
                    sonarHelperText.style.color = "#34d399";
                }

                if (telemetryStream) {
                    const now = new Date();
                    const timeStr = now.toTimeString().split(" ")[0];
                    const newLog = document.createElement("div");
                    newLog.className = "log-row verified";
                    newLog.style.background = "rgba(168, 85, 247, 0.15)";
                    newLog.style.border = "1px solid rgba(168, 85, 247, 0.4)";
                    newLog.innerHTML = `
                        <span class="log-time">${timeStr}</span>
                        <span class="log-badge pass" style="background:#a855f7; color:#fff;">ACOUSTIC</span>
                        <span class="log-desc">Ultrasonic 2-FSK Verified • ${preset.label} (${preset.rssi}) • Inaudible (18.6–19.8 kHz) ✓</span>
                    `;
                    telemetryStream.insertBefore(newLog, telemetryStream.firstChild);
                }
            }, 550);

            setTimeout(() => {
                if (sonarHelperText) {
                    sonarHelperText.textContent = "TRANSMIT CHIRP";
                    sonarHelperText.style.color = "#e9d5ff";
                }
            }, 2400);
        });
    }

    // 5b. Interactive Classroom Simulation Nodes
    const simNodes = document.querySelectorAll(".sim-student-node");
    const simEmitterStation = document.querySelector(".sim-emitter-station");

    if (simEmitterStation) {
        simEmitterStation.addEventListener("click", function () {
            this.style.transform = "scale(1.2)";
            setTimeout(() => { this.style.transform = ""; }, 300);
            if (sonarTarget) sonarTarget.click();
        });
    }

    simNodes.forEach(node => {
        node.addEventListener("click", function () {
            const tooltip = this.querySelector(".node-tooltip");
            const text = tooltip ? tooltip.textContent : "Student Verified";
            
            // Visual pulse
            this.style.transform = "scale(1.35)";
            setTimeout(() => { this.style.transform = ""; }, 350);

            if (telemetryStream) {
                const now = new Date();
                const timeStr = now.toTimeString().split(" ")[0];
                const newLog = document.createElement("div");
                newLog.className = "log-row verified";
                newLog.style.background = "rgba(6, 182, 212, 0.15)";
                newLog.style.border = "1px solid rgba(6, 182, 212, 0.4)";
                newLog.innerHTML = `
                    <span class="log-time">${timeStr}</span>
                    <span class="log-badge pass" style="background:#06b6d4; color:#fff;">SEATING</span>
                    <span class="log-desc">${text} • Inaudible 2-FSK (18.6–19.8 kHz) Verified ✓</span>
                `;
                telemetryStream.insertBefore(newLog, telemetryStream.firstChild);
            }
        });
    });

    // 6. Continuous Live Telemetry Log Generator (Simulates ongoing campus activity)
    const sampleStudents = [
        { name: "Pooja V.", id: "AIML-9912A", dist: "3.2m", acoustic: "Front Row (2.1m)" },
        { name: "Rohan D.", id: "AIML-4421B", dist: "6.8m", acoustic: "Middle Row (4.5m)" },
        { name: "Sneha M.", id: "AIML-7714C", dist: "11.4m", acoustic: "Back Row (8.2m)" },
        { name: "Vikram S.", id: "AIML-1120D", dist: "15.0m", acoustic: "Far Seating (10.4m)" }
    ];
    let sampleIdx = 0;

    setInterval(function () {
        if (telemetryStream && sampleIdx < sampleStudents.length) {
            const st = sampleStudents[sampleIdx];
            const now = new Date();
            const timeStr = now.toTimeString().split(" ")[0];
            const logRow = document.createElement("div");
            logRow.className = "log-row verified";
            logRow.innerHTML = `
                <span class="log-time">${timeStr}</span>
                <span class="log-badge pass">VERIFIED</span>
                <span class="log-desc">${st.name} (${st.id}) • GPS: ${st.dist} inside • FIDO2 Passkey ✓</span>
            `;
            telemetryStream.insertBefore(logRow, telemetryStream.firstChild);
            sampleIdx++;
        }
    }, 12000);

    // 6. Scroll Animations
    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });

    document.querySelectorAll(".scroll-animate").forEach(el => {
        scrollObserver.observe(el);
    });
});
