/**
 * Attendify Homepage Interactive Engine (v3)
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Mobile Navigation Menu Toggle
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

    // 2. Interactive Terminal Showcase Tabs
    const tabButtons = document.querySelectorAll(".showcase-tab");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabButtons.forEach(button => {
        button.addEventListener("click", function () {
            const targetTab = this.getAttribute("data-tab");

            tabButtons.forEach(btn => btn.classList.remove("active"));
            tabPanels.forEach(panel => panel.classList.remove("active"));

            this.classList.add("active");
            const activePanel = document.getElementById("tabContent-" + targetTab);
            if (activePanel) {
                activePanel.classList.add("active");
            }
        });
    });

    // 3. Interactive Biometric Scanner Demo
    const heroFingerprintScanner = document.getElementById("heroFingerprintScanner");
    const heroAuthResult = document.getElementById("heroAuthResult");

    if (heroFingerprintScanner && heroAuthResult) {
        heroFingerprintScanner.addEventListener("click", function () {
            const icon = this.querySelector(".fp-icon");
            if (icon) {
                icon.style.color = "#10b981";
                icon.style.transform = "scale(1.15)";
            }

            heroAuthResult.style.transform = "scale(1.02)";
            heroAuthResult.style.borderColor = "#10b981";

            if (typeof window.uiToast === "function") {
                window.uiToast("FIDO2 Biometric signature verified via Secure Enclave!", "success", "Passkey Authenticated");
            }

            setTimeout(() => {
                if (icon) {
                    icon.style.color = "#38bdf8";
                    icon.style.transform = "scale(1)";
                }
                heroAuthResult.style.transform = "scale(1)";
            }, 1000);
        });
    }

    // 4. Live Simulated Telemetry Ticker (Auto-increments check-in counter)
    let currentPresent = 44;
    const totalStudents = 50;
    const verifiedRatio = document.getElementById("liveVerifiedRatio");
    const presentVal = document.getElementById("livePresentVal");
    const absentVal = document.getElementById("liveAbsentVal");
    const barFill = document.querySelector(".telemetry-bar-fill");

    function updateLiveCheckin() {
        if (currentPresent < 49) {
            currentPresent += 1;
            const absent = totalStudents - currentPresent;
            const percentage = Math.round((currentPresent / totalStudents) * 100);

            if (verifiedRatio) verifiedRatio.textContent = currentPresent + " / " + totalStudents + " Present";
            if (presentVal) presentVal.textContent = currentPresent;
            if (absentVal) absentVal.textContent = absent;
            if (barFill) barFill.style.width = percentage + "%";
        }
    }

    setInterval(updateLiveCheckin, 9000);

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
