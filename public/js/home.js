/**
 * Attendify Next-Gen Cyber Landing Engine (v4)
 * Pure in-card interactive simulation with zero intrusive popups.
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Mobile Menu Handling
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

    // 2. Interactive Tactical Terminal Tabs
    const tabButtons = document.querySelectorAll(".t-tab-btn");
    const screens = document.querySelectorAll(".terminal-screen");

    tabButtons.forEach(button => {
        button.addEventListener("click", function () {
            const targetTab = this.getAttribute("data-terminal-tab");

            tabButtons.forEach(btn => btn.classList.remove("active"));
            screens.forEach(screen => screen.classList.remove("active"));

            this.classList.add("active");
            const activeScreen = document.getElementById("terminalScreen-" + targetTab);
            if (activeScreen) {
                activeScreen.classList.add("active");
            }
        });
    });

    // 3. In-Card Biometric Scanner Experience (No Popups!)
    const scanDevice = document.getElementById("interactiveScanDevice");
    const laserLine = document.getElementById("laserScannerLine");
    const promptText = document.getElementById("scanPromptText");
    const cryptoFeed = document.getElementById("cryptoFeedLog");

    if (scanDevice && laserLine && cryptoFeed) {
        scanDevice.addEventListener("click", function () {
            laserLine.classList.remove("scanning");
            void laserLine.offsetWidth; // trigger reflow
            laserLine.classList.add("scanning");

            const fpIcon = this.querySelector(".main-fp-icon");
            if (fpIcon) {
                fpIcon.style.color = "#10b981";
                fpIcon.style.transform = "scale(1.15)";
            }

            if (promptText) {
                promptText.textContent = "Authenticating with Secure Enclave...";
                promptText.style.color = "#34d399";
            }

            cryptoFeed.innerHTML = `
                <div class="feed-line"><span class="t-cyan">[WEBAUTHN]</span> 32-Byte challenge received from server: 0x8f2a7b1c...</div>
                <div class="feed-line"><span class="t-emerald">[ENCLAVE]</span> Biometric verified! ECDSA P-256 signature generated (0.32s) ✓</div>
                <div class="feed-line"><span class="t-purple">[TOKEN]</span> Single-use Attendance Token issued: #att_` + Math.random().toString(36).substring(2, 9) + `</div>
            `;

            setTimeout(() => {
                if (fpIcon) {
                    fpIcon.style.color = "#38bdf8";
                    fpIcon.style.transform = "scale(1)";
                }
                if (promptText) {
                    promptText.textContent = "Hardware Biometrics Verified ✓";
                    promptText.style.color = "#38bdf8";
                }
            }, 1400);
        });
    }

    // 4. Interactive "Test My Check-In" Radar Simulator
    const simulateBtn = document.getElementById("simulateCheckinBtn");
    const dynamicBlip = document.getElementById("dynamicStudentBlip");
    const countVal = document.getElementById("radarCountVal");
    const progressBar = document.getElementById("radarProgressBar");
    const streamLogs = document.getElementById("streamLogsBox");

    let isCheckedIn = false;

    if (simulateBtn && dynamicBlip && countVal && progressBar) {
        simulateBtn.addEventListener("click", function () {
            if (!isCheckedIn) {
                isCheckedIn = true;
                dynamicBlip.style.display = "flex";
                countVal.textContent = "45 / 50 Present (90%)";
                countVal.style.color = "#34d399";
                progressBar.style.width = "90%";
                this.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> You Are Verified!`;
                this.style.borderColor = "#10b981";
                this.style.background = "rgba(16, 185, 129, 0.2)";
                this.style.color = "#34d399";

                if (streamLogs) {
                    const now = new Date();
                    const timeStr = now.toTimeString().split(" ")[0];
                    const newLog = document.createElement("div");
                    newLog.className = "log-entry";
                    newLog.style.background = "rgba(6, 182, 212, 0.15)";
                    newLog.style.border = "1px solid rgba(6, 182, 212, 0.4)";
                    newLog.innerHTML = `<span class="time">${timeStr}</span> <span class="tag verified" style="color: #38bdf8;">[YOU]</span> Student Check-In Verified • Distance: 5.2m inside geofence • FIDO2 Passkey ✓`;
                    streamLogs.insertBefore(newLog, streamLogs.firstChild);
                }
            } else {
                // Reset
                isCheckedIn = false;
                dynamicBlip.style.display = "none";
                countVal.textContent = "44 / 50 Present (88%)";
                countVal.style.color = "#ffffff";
                progressBar.style.width = "88%";
                this.innerHTML = `<i class="fa-solid fa-location-arrow"></i> Test My Check-in`;
                this.style.borderColor = "rgba(6, 182, 212, 0.4)";
                this.style.background = "rgba(6, 182, 212, 0.15)";
                this.style.color = "#38bdf8";
            }
        });
    }

    // 5. Scroll Animation Observer
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
