(function () {
    window.AttendifySelectEnhancerLoaded = true;
    function normalizeText(value) {
        return String(value || "").toLowerCase();
    }

    function getSelectIcon(select) {
        const customIcon = select.getAttribute("data-select-icon");

        if (customIcon) {
            return customIcon;
        }

        const key = [
            select.name,
            select.id,
            select.className,
            select.getAttribute("data-schedule-filter"),
            select.getAttribute("data-student-filter"),
            select.getAttribute("data-teacher-record-filter"),
            select.getAttribute("data-teacher-attempt-filter"),
            select.getAttribute("data-teacher-schedule-filter")
        ].map(normalizeText).join(" ");

        if (key.includes("status") || key.includes("state") || key.includes("reason")) {
            return "fa-solid fa-filter";
        }

        if (key.includes("subject")) {
            return "fa-solid fa-book-open";
        }

        if (key.includes("teacher")) {
            return "fa-solid fa-user-tie";
        }

        if (key.includes("student")) {
            return "fa-solid fa-user-graduate";
        }

        if (key.includes("classroom") || key.includes("room")) {
            return "fa-solid fa-door-open";
        }

        if (key.includes("classgroup") || key.includes("group")) {
            return "fa-solid fa-users";
        }

        if (key.includes("department")) {
            return "fa-solid fa-building-columns";
        }

        if (key.includes("semester")) {
            return "fa-solid fa-layer-group";
        }

        if (key.includes("day") || key.includes("date")) {
            return "fa-solid fa-calendar-day";
        }

        if (key.includes("role")) {
            return "fa-solid fa-user-shield";
        }

        if (key.includes("time")) {
            return "fa-solid fa-clock";
        }

        return "fa-solid fa-list-check";
    }

    function syncDisabledState(wrapper, select) {
        if (!wrapper || !select) {
            return;
        }

        wrapper.classList.toggle("is-disabled", Boolean(select.disabled));
    }

    function enhanceSelect(select) {
        if (!select || select.closest(".select-shell")) {
            return;
        }

        const wrapper = document.createElement("span");
        wrapper.className = "select-shell";

        if (select.classList.contains("compact-select")) {
            wrapper.classList.add("select-shell-compact");
        }

        const leadingIcon = document.createElement("i");
        leadingIcon.className = "select-shell-icon " + getSelectIcon(select);
        leadingIcon.setAttribute("aria-hidden", "true");

        const chevronIcon = document.createElement("i");
        chevronIcon.className = "select-shell-chevron fa-solid fa-angle-down";
        chevronIcon.setAttribute("aria-hidden", "true");

        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(leadingIcon);
        wrapper.appendChild(select);
        wrapper.appendChild(chevronIcon);

        syncDisabledState(wrapper, select);

        const observer = new MutationObserver(function () {
            syncDisabledState(wrapper, select);
        });

        observer.observe(select, {
            attributes: true,
            attributeFilter: ["disabled", "class"]
        });
    }

    function enhanceAllSelects(root) {
        const scope = root || document;
        const selects = scope.querySelectorAll("select");

        selects.forEach(enhanceSelect);
    }

    function watchDynamicSelects() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) {
                        return;
                    }

                    if (node.tagName === "SELECT") {
                        enhanceSelect(node);
                        return;
                    }

                    if (typeof node.querySelectorAll === "function") {
                        enhanceAllSelects(node);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function boot() {
        enhanceAllSelects(document);
        watchDynamicSelects();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
