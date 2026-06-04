document.addEventListener("DOMContentLoaded", function () {
    const menuButton = document.getElementById("homeMenuBtn");
    const navLinks = document.getElementById("homeNavLinks");
    const navOverlay = document.getElementById("homeNavOverlay");
    const homePage = document.querySelector(".home-page");

    if (!menuButton || !navLinks) {
        return;
    }

    function syncMenuUi(isOpen) {
        navLinks.classList.toggle("open", isOpen);
        document.body.classList.toggle("home-nav-open", isOpen);
        if (homePage) {
            homePage.classList.toggle("home-nav-open", isOpen);
        }
        if (navOverlay) {
            navOverlay.classList.toggle("open", isOpen);
        }
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

    function closeMenu() {
        syncMenuUi(false);
    }

    menuButton.addEventListener("click", function () {
        syncMenuUi(!navLinks.classList.contains("open"));
    });

    if (navOverlay) {
        navOverlay.addEventListener("click", closeMenu);
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && navLinks.classList.contains("open")) {
            closeMenu();
        }
    });

    document.addEventListener("click", function (event) {
        if (!navLinks.classList.contains("open")) {
            return;
        }

        if (menuButton.contains(event.target) || navLinks.contains(event.target)) {
            return;
        }

        closeMenu();
    });

    window.addEventListener("resize", function () {
        if (window.innerWidth > 820 && navLinks.classList.contains("open")) {
            closeMenu();
        }
    });

    navLinks.addEventListener("click", function (event) {
        const target = event.target;
        if (
            target &&
            target.tagName === "A" &&
            navLinks.classList.contains("open") &&
            window.innerWidth <= 820
        ) {
            closeMenu();
        }
    });
});
