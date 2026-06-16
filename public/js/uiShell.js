(function () {
    const STORAGE_VERSION_KEY = "attendifyUiShellVersion";
    const CURRENT_VERSION = "2026-05-24-final-ui-stable-8";

    function resetOldBrokenStateOnce() {
        if (localStorage.getItem(STORAGE_VERSION_KEY) === CURRENT_VERSION) {
            return;
        }

        [
            "adminSidebarCollapsed",
            "studentSidebarCollapsed",
            "teacherSidebarCollapsed",
            "platformSidebarCollapsed",
            "appSidebarCollapsed"
        ].forEach(function (key) {
            localStorage.removeItem(key);
        });

        localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION);
    }

    function createLines() {
        const lines = document.createElement("span");
        lines.className = "ui-sidebar-toggle-lines";

        for (let i = 0; i < 3; i++) {
            lines.appendChild(document.createElement("span"));
        }

        return lines;
    }

    function createToggleButton(className) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.setAttribute("aria-label", "Toggle sidebar");
        button.appendChild(createLines());

        return button;
    }

    function getSidebar() {
        return document.querySelector(
            ".admin-sidebar, .student-sidebar, .schedule-sidebar, .teacher-sidebar, .platform-sidebar"
        );
    }

    function isDrawerMode() {
        return window.innerWidth <= 1280;
    }

    function getStorageKey(sidebar) {
        if (sidebar.classList.contains("admin-sidebar")) {
            return "adminSidebarCollapsed";
        }

        if (
            sidebar.classList.contains("student-sidebar") ||
            sidebar.classList.contains("schedule-sidebar")
        ) {
            return "studentSidebarCollapsed";
        }

        if (sidebar.classList.contains("teacher-sidebar")) {
            return "teacherSidebarCollapsed";
        }

        if (sidebar.classList.contains("platform-sidebar")) {
            return "platformSidebarCollapsed";
        }

        return "appSidebarCollapsed";
    }

    function wrapLooseSidebarText(sidebar) {
        const clickableItems = sidebar.querySelectorAll("a, button:not(.ui-sidebar-toggle)");

        clickableItems.forEach(function (item) {
            Array.from(item.childNodes).forEach(function (node) {
                if (node.nodeType !== Node.TEXT_NODE) {
                    return;
                }

                const text = node.textContent.replace(/\s+/g, " ").trim();

                if (!text) {
                    node.textContent = "";
                    return;
                }

                const span = document.createElement("span");
                span.className = "shell-text";
                span.textContent = text;

                item.replaceChild(span, node);
            });
        });
    }

    function normalizeExistingToggle(sidebar) {
        let button = document.getElementById("adminSidebarToggle");

        if (!button) {
            button = sidebar.querySelector(".admin-sidebar-toggle, .ui-sidebar-toggle");
        }

        if (!button) {
            return null;
        }

        button.classList.add("ui-sidebar-toggle");
        button.innerHTML = "";
        button.appendChild(createLines());

        return button;
    }

    function applyState(sidebar) {
        document.body.classList.remove("ui-sidebar-open");

        if (isDrawerMode()) {
            document.body.classList.remove("ui-sidebar-collapsed");
            document.body.classList.remove("admin-sidebar-collapsed");
            return;
        }

        const saved = localStorage.getItem(getStorageKey(sidebar));

        if (saved === "true") {
            document.body.classList.add("ui-sidebar-collapsed");
            document.body.classList.add("admin-sidebar-collapsed");
        } else {
            document.body.classList.remove("ui-sidebar-collapsed");
            document.body.classList.remove("admin-sidebar-collapsed");
        }
    }

    function notifyLayoutChanged() {
        // Give the CSS transition time to complete before invalidating map size
        setTimeout(function () {
            window.dispatchEvent(new CustomEvent("attendify:layout-changed"));
        }, 320);
    }

    function toggleSidebar(sidebar) {
        if (isDrawerMode()) {
            document.body.classList.toggle("ui-sidebar-open");
            notifyLayoutChanged();
            return;
        }

        document.body.classList.toggle("ui-sidebar-collapsed");
        document.body.classList.toggle("admin-sidebar-collapsed");

        const collapsed = document.body.classList.contains("ui-sidebar-collapsed");

        localStorage.setItem(getStorageKey(sidebar), collapsed ? "true" : "false");
        notifyLayoutChanged();
    }

    function closeDrawer() {
        document.body.classList.remove("ui-sidebar-open");
        notifyLayoutChanged();
    }

    function syncActiveSidebarLink(sidebar) {
        const sidebarLinks = sidebar.querySelectorAll(
            ".shell-sidebar-nav a[href], .shell-sidebar-footer a[href]"
        );

        if (!sidebarLinks.length) {
            return;
        }

        const currentUrl = new URL(window.location.href);
        let bestLink = null;
        let bestScore = -1;

        sidebarLinks.forEach(function (link) {
            const href = link.getAttribute("href");

            if (!href || href.startsWith("javascript:")) {
                return;
            }

            const targetUrl = new URL(href, window.location.origin);

            if (targetUrl.origin !== currentUrl.origin) {
                return;
            }

            let score = -1;

            if (targetUrl.pathname === currentUrl.pathname) {
                if (!targetUrl.hash && !currentUrl.hash) {
                    score = 2;
                } else if (targetUrl.hash && targetUrl.hash === currentUrl.hash) {
                    score = 3;
                } else if (!targetUrl.hash) {
                    score = 1;
                } else {
                    score = 0;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestLink = link;
            }
        });

        if (!bestLink) {
            return;
        }

        sidebarLinks.forEach(function (link) {
            link.classList.remove("active");
        });

        bestLink.classList.add("active");
    }

    function initializeUiShell() {
        const role = getRealtimeRoleFromPath();

        installShell();
        installRealtime();
        normalizeFormAccessibility();
        wrapSelects();
        enableFileInputs();
    }

    function normalizeFormAccessibility() {
        const controls = document.querySelectorAll("input, select, textarea");
        let nextId = 0;

        controls.forEach(function (control) {
            if (control.type === "hidden") {
                return;
            }

            if (!control.id) {
                nextId += 1;
                control.id = "attendify-field-" + nextId;
            }
        });

        const labels = document.querySelectorAll("label");
        labels.forEach(function (label) {
            if (label.getAttribute("for")) {
                return;
            }

            let target =
                label.querySelector("input, select, textarea") ||
                (label.nextElementSibling &&
                    label.nextElementSibling.matches("input, select, textarea")
                    ? label.nextElementSibling
                    : null);

            if (!target && label.parentElement) {
                target = label.parentElement.querySelector("input, select, textarea");
            }

            if (!target || target.type === "hidden") {
                return;
            }

            if (!target.id) {
                nextId += 1;
                target.id = "attendify-field-" + nextId;
            }

            label.setAttribute("for", target.id);
        });

        const iconButtons = document.querySelectorAll("button");
        iconButtons.forEach(function (button) {
            const hasText = (button.textContent || "").trim().length > 0;
            if (hasText || button.getAttribute("aria-label")) {
                return;
            }

            const title = button.getAttribute("title");
            if (title) {
                button.setAttribute("aria-label", title);
            }
        });

        const decorativeIcons = document.querySelectorAll("i");
        decorativeIcons.forEach(function (icon) {
            if (icon.hasAttribute("aria-hidden") || icon.closest("svg")) {
                return;
            }

            if (icon.closest("button") || icon.closest("a")) {
                if ((icon.textContent || "").trim()) {
                    return;
                }

                icon.setAttribute("aria-hidden", "true");
                return;
            }

            icon.setAttribute("aria-hidden", "true");
        });
    }

    function installShell() {
        if (document.documentElement.dataset.uiShellInstalled === "true") {
            return;
        }

        resetOldBrokenStateOnce();

        const sidebar = getSidebar();

        if (!sidebar) {
            return;
        }

        sidebar.classList.add("ui-sidebar");

        wrapLooseSidebarText(sidebar);
        syncActiveSidebarLink(sidebar);

        let desktopToggle = normalizeExistingToggle(sidebar);

        if (!desktopToggle) {
            desktopToggle = createToggleButton("ui-sidebar-toggle");
            sidebar.insertBefore(desktopToggle, sidebar.firstChild);
        }

        if (!document.querySelector(".ui-mobile-sidebar-toggle")) {
            const mobileToggle = createToggleButton("ui-mobile-sidebar-toggle");
            document.body.appendChild(mobileToggle);

            mobileToggle.addEventListener("click", function () {
                toggleSidebar(sidebar);
            });
        }

        if (!document.querySelector(".ui-sidebar-overlay")) {
            const overlay = document.createElement("div");
            overlay.className = "ui-sidebar-overlay";
            document.body.appendChild(overlay);

            overlay.addEventListener("click", closeDrawer);
        }

        desktopToggle.addEventListener("click", function () {
            toggleSidebar(sidebar);
        });

        sidebar.addEventListener("click", function (event) {
            const link = event.target.closest("a");

            if (link && isDrawerMode()) {
                closeDrawer();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeDrawer();
            }
        });

        let resizeTimer = null;

        window.addEventListener("resize", function () {
            clearTimeout(resizeTimer);

            resizeTimer = setTimeout(function () {
                applyState(sidebar);
            }, 120);
        });

        window.addEventListener("hashchange", function () {
            syncActiveSidebarLink(sidebar);
        });

        window.addEventListener("popstate", function () {
            syncActiveSidebarLink(sidebar);
        });

        applyState(sidebar);

        document.documentElement.dataset.uiShellInstalled = "true";
    }

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (
                src === "/socket.io/socket.io.js" &&
                typeof window.io !== "undefined"
            ) {
                resolve();
                return;
            }

            const existing = document.querySelector("script[data-ui-shell-src='" + src + "']");

            if (existing) {
                if (existing.dataset.loaded === "true") {
                    resolve();
                    return;
                }

                existing.addEventListener("load", function () {
                    existing.dataset.loaded = "true";
                    resolve();
                }, { once: true });

                existing.addEventListener("error", function () {
                    reject(new Error("Could not load script: " + src));
                }, { once: true });

                return;
            }

            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.dataset.uiShellSrc = src;

            script.addEventListener("load", function () {
                script.dataset.loaded = "true";
                resolve();
            }, { once: true });

            script.addEventListener("error", function () {
                reject(new Error("Could not load script: " + src));
            }, { once: true });

            document.head.appendChild(script);
        });
    }

    function getRealtimeRoleFromPath() {
        const path = window.location.pathname || "";

        if (path.indexOf("/student") === 0) {
            return "student";
        }

        if (path.indexOf("/teacher") === 0) {
            return "teacher";
        }

        if (path.indexOf("/admin") === 0) {
            return "admin";
        }

        if (path.indexOf("/platform-admin") === 0) {
            return "platform-admin";
        }

        return "";
    }

    function getUnreadCountApiPath(role) {
        if (role === "student") {
            return "/student/notifications/unread-count";
        }

        if (role === "teacher") {
            return "/teacher/notifications/unread-count";
        }

        if (role === "admin") {
            return "/admin/notifications/unread-count";
        }

        if (role === "platform-admin") {
            return "/platform-admin/notifications/unread-count";
        }

        return "";
    }

    function getNotificationRoleCode(role) {
        if (role === "student") {
            return "STUDENT";
        }

        if (role === "teacher") {
            return "TEACHER";
        }

        if (role === "admin") {
            return "ADMIN";
        }

        if (role === "platform-admin") {
            return "PLATFORM_ADMIN";
        }

        return "";
    }

    function updateNotificationBadges(count) {
        const badges = document.querySelectorAll(".js-notification-badge");
        const unread = Number(count || 0);
        const text = unread > 99 ? "99+" : String(unread);

        badges.forEach(function (badge) {
            if (unread > 0) {
                badge.textContent = text;
                badge.classList.add("has-unread");
            } else {
                badge.textContent = "";
                badge.classList.remove("has-unread");
            }
        });
    }

    function showRealtimeToast(message, type) {
        if (!message) {
            return;
        }

        let toast = document.getElementById("uiRealtimeToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "uiRealtimeToast";
            toast.className = "ui-realtime-toast";
            document.body.appendChild(toast);
        }

        toast.classList.remove("danger");
        toast.classList.remove("success");

        if (type === "danger") {
            toast.classList.add("danger");
        } else if (type === "success") {
            toast.classList.add("success");
        }

        toast.textContent = message;
        toast.classList.add("show");

        setTimeout(function () {
            toast.classList.remove("show");
        }, 2600);
    }

    function shouldAutoReloadForUpdate(role) {
        const path = window.location.pathname || "";

        if (role === "student") {
            return (
                path === "/student/dashboard" ||
                path === "/student/schedule" ||
                path === "/student/passkeys" ||
                path === "/student/notifications"
            );
        }

        if (role === "teacher") {
            return (
                path === "/teacher/dashboard" ||
                path.indexOf("/teacher/manual-attendance") === 0 ||
                path === "/teacher/reports" ||
                path === "/teacher/notifications"
            );
        }

        if (role === "admin") {
            return path.indexOf("/admin/") === 0;
        }

        if (role === "platform-admin") {
            return path.indexOf("/platform-admin/") === 0;
        }

        return false;
    }

    function installRealtime() {
        const role = getRealtimeRoleFromPath();
        const path = window.location.pathname || "";

        if (!role || path.indexOf("/login") !== -1) {
            return;
        }

        const config = window.AttendifyRealtimeConfig || { mode: "socket", pollIntervalMs: 5000 };

        if (config.mode === "disabled") {
            console.log("Realtime disabled by configuration.");
            return;
        }

        let reloadPending = false;

        function queueReload(message) {
            if (reloadPending || !shouldAutoReloadForUpdate(role)) {
                return;
            }

            reloadPending = true;
            showRealtimeToast(message || "New update received. Refreshing...", "success");

            setTimeout(function () {
                window.location.reload();
            }, 900);
        }

        if (config.mode === "polling") {
            console.log("Realtime using polling fallback.");
            let lastPollServerTime = 0;

            // Do initial unread count fetch immediately
            const unreadCountApi = getUnreadCountApiPath(role);
            if (unreadCountApi) {
                fetch(unreadCountApi, { method: "GET", credentials: "same-origin" })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.success) {
                            updateNotificationBadges(data.unreadCount || 0);
                        }
                    })
                    .catch(() => { });
            }

            let isPolling = false;
            // Polling loop for core state changes
            setInterval(function () {
                if (reloadPending || isPolling) return;

                const pollApi = role === "student" ? "/student/realtime/poll" :
                    role === "teacher" ? "/teacher/realtime/poll" :
                    role === "admin" ? "/admin/realtime/poll" :
                    role === "platform-admin" ? "/platform-admin/realtime/poll" : null;

                if (!pollApi) return;

                isPolling = true;
                const url = lastPollServerTime ? pollApi + "?since=" + lastPollServerTime : pollApi;

                fetch(url, { method: "GET", credentials: "same-origin" })
                    .then(res => res.json())
                    .then(data => {
                        if (!data || !data.success) return;

                        if (data.serverTimestamp) {
                            lastPollServerTime = data.serverTimestamp;
                        }

                        if (typeof data.unreadNotificationCount !== "undefined") {
                            updateNotificationBadges(data.unreadNotificationCount);
                        }

                        // Let specific role JS files handle the specific state updates if they want,
                        // or we can trigger simple reloads here based on flags.
                        // For uiShell, we just want to know if there's a reason to auto-reload
                        // (e.g. a new session started that we didn't know about).
                        // Role-specific JS will listen to a custom event.
                        window.dispatchEvent(new CustomEvent("attendify:poll-data", { detail: data }));
                    })
                    .catch(() => { })
                    .finally(() => {
                        isPolling = false;
                    });
            }, config.pollIntervalMs || 5000);

            return;
        }

        // Socket mode (default)
        loadScript("/socket.io/socket.io.js")
            .then(function () {
                if (typeof window.io === "undefined") {
                    return;
                }

                if (!window.AttendifySharedSocket) {
                    window.AttendifySharedSocket = window.io({
                        transports: ["websocket", "polling"],
                        withCredentials: true,
                        timeout: 20000,
                        reconnectionAttempts: 20,
                        reconnectionDelay: 1000,
                        reconnectionDelayMax: 5000
                    });
                }

                const socket = window.AttendifySharedSocket;

                if (!socket || socket.__uiShellRealtimeAttached === true) {
                    return;
                }

                socket.__uiShellRealtimeAttached = true;

                window.dispatchEvent(
                    new CustomEvent("attendify:socket-ready", {
                        detail: { role: role }
                    })
                );

                function dispatchRealtimeEvent(name, detail) {
                    window.dispatchEvent(
                        new CustomEvent(name, {
                            detail: detail || {}
                        })
                    );
                }

                function joinRealtimeRooms() {
                    if (role === "student") {
                        socket.emit("student:join");
                    } else if (role === "teacher") {
                        socket.emit("teacher:join");
                    } else if (role === "admin") {
                        socket.emit("admin:join");
                        socket.emit("teacher:join");
                    } else if (role === "platform-admin") {
                        socket.emit("platform-admin:join");
                    }
                }

                socket.on("connect", function () {
                    joinRealtimeRooms();
                });

                if (socket.connected) {
                    joinRealtimeRooms();
                }

                let lastSocketErrorToastAt = 0;

                function showSocketIssueToast(message) {
                    const now = Date.now();

                    if (now - lastSocketErrorToastAt < 30000) { // Throttled to 30s
                        return;
                    }

                    lastSocketErrorToastAt = now;
                    showRealtimeToast(message, "danger");
                }

                if (!window.__attendifyRoleSpecificRealtime) {
                    socket.on("socket:error", function (payload) {
                        if (!payload || !payload.message) {
                            return;
                        }

                        showSocketIssueToast(payload.message);
                    });

                    let uiShellConnectErrorShown = false;
                    socket.on("connect_error", function () {
                        if (!uiShellConnectErrorShown) {
                            showSocketIssueToast("Realtime temporarily unavailable. The page will keep updating automatically.");
                            uiShellConnectErrorShown = true;
                        }
                    });
                }

                const myNotificationRole = getNotificationRoleCode(role);

                socket.on("notification:new", function (payload) {
                    if (!payload || !payload.title) {
                        return;
                    }

                    if (
                        payload.recipientRole &&
                        myNotificationRole &&
                        payload.recipientRole !== myNotificationRole
                    ) {
                        return;
                    }

                    showRealtimeToast(payload.title, payload.level === "danger" ? "danger" : "success");

                    const currentBadge = document.querySelector(".js-notification-badge.has-unread");
                    const currentUnread = currentBadge
                        ? (parseInt(currentBadge.textContent || "0", 10) || 0)
                        : 0;
                    updateNotificationBadges(currentUnread + 1);

                    if (window.location.pathname.indexOf("/notifications") !== -1) {
                        queueReload("New notification received. Refreshing...");
                    }
                });

                socket.on("notification:unread-count", function (payload) {
                    if (!payload || !payload.recipientRole) {
                        return;
                    }

                    if (payload.recipientRole !== myNotificationRole) {
                        return;
                    }

                    updateNotificationBadges(payload.unreadCount || 0);
                });

                socket.on("student:passkey-state-changed", function (payload) {
                    if (!payload) return;
                    
                    if (window.location.pathname.indexOf("/student/passkeys") !== -1) {
                        queueReload(payload.message || "Passkey settings updated. Refreshing...");
                    } else {
                        showRealtimeToast(payload.toast || "Your passkey settings were updated.", "success");
                    }
                });

                socket.on("schedule:changed", function (payload) {
                    dispatchRealtimeEvent("attendify:schedule-changed", payload);

                    if (role === "admin" || role === "teacher") {
                        showRealtimeToast("Schedule updated.", "success");
                    } else {
                        queueReload("Schedule updated. Refreshing...");
                    }
                });

                socket.on("attendance:started:admin", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-started", payload);
                    showRealtimeToast("Attendance session started.", "success");
                });

                socket.on("attendance:ended:admin", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-ended", payload);
                    showRealtimeToast("Attendance session ended.", "success");
                });

                socket.on("attendance:started", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-started", payload);

                    if (
                        role === "student" &&
                        window.location.pathname !== "/student/dashboard" &&
                        window.location.pathname !== "/student/schedule"
                    ) {
                        queueReload("Class is live now. Refreshing...");
                    }
                });

                socket.on("attendance:ended", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-ended", payload);

                    if (
                        role === "student" &&
                        window.location.pathname !== "/student/dashboard" &&
                        window.location.pathname !== "/student/schedule"
                    ) {
                        queueReload("Attendance window updated. Refreshing...");
                    }
                });

                socket.on("attendance:started:teacher", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-started", payload);
                });

                socket.on("attendance:ended:teacher", function (payload) {
                    dispatchRealtimeEvent("attendify:attendance-ended", payload);
                });

                const unreadCountApi = getUnreadCountApiPath(role);

                if (!unreadCountApi) {
                    return;
                }

                fetch(unreadCountApi, {
                    method: "GET",
                    credentials: "same-origin"
                })
                    .then(function (res) {
                        return res.json();
                    })
                    .then(function (data) {
                        if (!data || !data.success) {
                            return;
                        }

                        updateNotificationBadges(data.unreadCount || 0);
                    })
                    .catch(function () {
                        // Ignore unread count fetch failure silently.
                    });
            })
            .catch(function () {
                // Ignore realtime bootstrap failure silently.
            });
    }

    function wrapSelects() {
        if (window.AttendifySelectEnhancerLoaded) {
            return;
        }

        const selects = document.querySelectorAll('select');
        for (let i = 0; i < selects.length; i++) {
            const select = selects[i];
            if (select.closest('.select-shell')) {
                continue;
            }
            const wrapper = document.createElement('div');
            wrapper.className = 'select-shell';

            const icon = document.createElement('i');
            const defaultIcon = select.getAttribute('data-select-icon') || 'fa-solid fa-list-ul';
            icon.className = defaultIcon + ' select-shell-icon';

            const chevron = document.createElement('i');
            chevron.className = 'fa-solid fa-chevron-down select-shell-chevron';

            select.parentNode.insertBefore(wrapper, select);
            wrapper.appendChild(icon);
            wrapper.appendChild(select);
            wrapper.appendChild(chevron);
        }
    }

    function installThemeToggle() {
        const savedTheme = localStorage.getItem('attendifyTheme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }

        const profileCardDiv = document.querySelector('.profile-card > div:last-child');
        if (!profileCardDiv) return;

        // Ensure we don't add multiple buttons
        if (profileCardDiv.querySelector('.theme-toggle-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'theme-toggle-btn secondary-btn';
        btn.innerHTML = savedTheme === 'dark' ? '<i class="fa-solid fa-sun"></i> Toggle Light Mode' : '<i class="fa-solid fa-moon"></i> Toggle Dark Mode';
        btn.title = 'Toggle Theme';
        btn.style = 'padding: 4px 8px; font-size: 12px; border-radius: 4px; border: 1px solid #94a3b8; color: #475569; background: transparent; cursor: pointer; width: 100%; margin-top: 6px;';

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('attendifyTheme', newTheme);
            
            btn.innerHTML = newTheme === 'dark' ? '<i class="fa-solid fa-sun"></i> Toggle Light Mode' : '<i class="fa-solid fa-moon"></i> Toggle Dark Mode';
        });

        profileCardDiv.appendChild(btn);
    }

    // Apply theme as fast as possible
    const initialTheme = localStorage.getItem('attendifyTheme');
    if (initialTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    document.addEventListener("DOMContentLoaded", function () {
        installShell();
        wrapSelects();
        installRealtime();
        installThemeToggle();
        installPageTransitions();
    });

    // Smooth page-exit fade when navigating away
    function installPageTransitions() {
        // Only run on regular anchor clicks (not same-page hashes, not forms)
        document.addEventListener('click', function(e) {
            const anchor = e.target.closest('a[href]');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            // Skip hash links, javascript: links, new-tab links
            if (
                href.startsWith('#') ||
                href.startsWith('javascript') ||
                anchor.target === '_blank' ||
                e.metaKey || e.ctrlKey || e.shiftKey
            ) return;

            // Skip external links
            try {
                const url = new URL(href, window.location.origin);
                if (url.origin !== window.location.origin) return;
                // Skip same-page navigation
                if (url.pathname === window.location.pathname && url.hash) return;
            } catch (err) {
                return;
            }

            e.preventDefault();
            const destination = href;

            // Fade out the body
            document.body.style.transition = 'opacity 0.18s ease';
            document.body.style.opacity = '0';

            setTimeout(function() {
                window.location.href = destination;
            }, 180);
        });
    }
})();
