/**
 * Attendify Homepage Interactive Engine
 * Handles interactive tabs, live simulated radar telemetry, and smooth scroll triggers.
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Mobile Menu Handling
    const menuButton = document.getElementById("homeMenuBtn");
    const navLinks = document.getElementById("homeNavLinks");
    const navOverlay = document.getElementById("homeNavOverlay");
    const homePage = document.querySelector(".home-page");

    if (menuButton && navLinks) {
        function syncMenuUi(isOpen) {
            navLinks.classList.toggle("open", isOpen);
            document.body.classList.toggle("home-nav-open", isOpen);
            if (homePage) homePage.classList.toggle("home-nav-open", isOpen);
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

    // 2. Interactive Hero Tab Switcher
    const tabButtons = document.querySelectorAll(".sim-tab-btn");
    const tabContents = document.querySelectorAll(".sim-tab-content");

    tabButtons.forEach(button => {
        button.addEventListener("click", function () {
            const targetTab = this.getAttribute("data-tab");

            tabButtons.forEach(btn => btn.classList.remove("active"));
            tabContents.forEach(content => content.classList.remove("active"));

            this.classList.add("active");
            const activeContent = document.getElementById("simTab-" + targetTab);
            if (activeContent) {
                activeContent.classList.add("active");
            }
        });
    });

    // 3. Interactive Biometric Scanner Demo
    const demoFingerprintBtn = document.getElementById("demoFingerprintBtn");
    const demoScanResult = document.getElementById("demoScanResult");

    if (demoFingerprintBtn && demoScanResult) {
        demoFingerprintBtn.addEventListener("click", function () {
            const icon = this.querySelector(".fingerprint-icon");
            if (icon) {
                icon.style.color = "#10b981";
                icon.style.transform = "scale(1.2)";
            }

            demoScanResult.style.transform = "scale(1.04)";
            demoScanResult.style.borderColor = "#10b981";

            if (typeof window.uiToast === "function") {
                window.uiToast("FIDO2 Biometric signature verified via Apple Secure Enclave!", "success", "Passkey Authenticated");
            }

            setTimeout(() => {
                if (icon) {
                    icon.style.color = "#38bdf8";
                    icon.style.transform = "scale(1)";
                }
                demoScanResult.style.transform = "scale(1)";
            }, 1200);
        });
    }

    // 4. Live Simulated Telemetry Ticker (Auto-increments check-in counter)
    let currentPresent = 44;
    const totalClass = 50;
    const counterDisplay = document.getElementById("simCounterDisplay");
    const presentDisplay = document.getElementById("simPresentCount");
    const absentDisplay = document.getElementById("simAbsentCount");
    const progressFill = document.querySelector(".progress-fill");

    function updateSimulatedCheckin() {
        if (currentPresent < 49) {
            currentPresent += 1;
            const absent = totalClass - currentPresent;
            const percentage = Math.round((currentPresent / totalClass) * 100);

            if (counterDisplay) counterDisplay.textContent = currentPresent + " / " + totalClass + " Present";
            if (presentDisplay) presentDisplay.textContent = currentPresent;
            if (absentDisplay) absentDisplay.textContent = absent;
            if (progressFill) progressFill.style.width = percentage + "%";
        }
    }

    // Trigger subtle real-time simulation updates every 8 seconds
    setInterval(updateSimulatedCheckin, 8000);

    // 5. Scroll Animation Observer
    const scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.12
    });

    document.querySelectorAll(".scroll-animate").forEach(el => {
        scrollObserver.observe(el);
    });
});
