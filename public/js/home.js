/**
 * Attendify Ultra-Modern Landing Experience (v5)
 * Cartographic map simulation, in-card biometric scanning, and live stream telemetry.
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Mobile Menu Toggle
    const menuButton = document.getElementById("homeMenuBtn");
    const navLinks = document.getElementById("homeNavLinks");
    const navOverlay = document.getElementById("homeNavOverlay");

    if (menuButton && navLinks) {
        function syncMenuUi(isOpen) {
            navLinks.classList.toggle("open", isOpen);
            if (navOverlay) navOverlay.classList.toggle("open", isOpen);
            menuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
            const icon = menuButton.querySelector("i");
            if (icon) {
                if (isOpen) {
                    icon.classList.remove("fa-bars");
                    icon.classList.add("fa-xmark");
                } else {
                    icon.classList.remove("fa-xmark");
                    icon.classList.add("fa-bars");
                }
            }
        }

        menuButton.addEventListener("click", function () {
            syncMenuUi(!navLinks.classList.contains("open"));
        });

        if (navOverlay) {
            navOverlay.addEventListener("click", function () {
                syncMenuUi(false);
            });
        }

        navLinks.addEventListener("click", function (e) {
            if (e.target && e.target.tagName === "A" && window.innerWidth <= 820) {
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

    // 5. Scroll Animations
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
