(function () {
    function setupAccordionBehavior(containers, hasActiveState) {
        if (!containers || !containers.length) {
            return;
        }

        containers.forEach(function (container) {
            container.addEventListener("toggle", function () {
                if (!container.open) {
                    return;
                }

                if (hasActiveState()) {
                    return;
                }

                containers.forEach(function (otherContainer) {
                    if (otherContainer !== container) {
                        otherContainer.open = false;
                    }
                });
            });
        });
    }

    function setupDashboardScheduleFilters() {
        var dashboardRoot = document.querySelector(".teacher-dashboard-page");

        if (!dashboardRoot) {
            return;
        }

        var searchInput = dashboardRoot.querySelector("[data-teacher-schedule-search]");
        var groupSelect = dashboardRoot.querySelector("[data-teacher-schedule-filter='group']");
        var roomSelect = dashboardRoot.querySelector("[data-teacher-schedule-filter='room']");
        var stateSelect = dashboardRoot.querySelector("[data-teacher-schedule-filter='state']");
        var resetButton = dashboardRoot.querySelector("[data-teacher-schedule-reset]");
        var emptyState = dashboardRoot.querySelector("[data-teacher-schedule-empty]");
        var containers = Array.prototype.slice.call(
            dashboardRoot.querySelectorAll("[data-teacher-schedule-container]")
        );

        if (!containers.length) {
            return;
        }

        function hasActiveScheduleFilters() {
            var hasQuery = Boolean(searchInput && searchInput.value.trim().length > 0);
            var hasGroup = Boolean(groupSelect && groupSelect.value);
            var hasRoom = Boolean(roomSelect && roomSelect.value);
            var hasState = Boolean(stateSelect && stateSelect.value);

            return hasQuery || hasGroup || hasRoom || hasState;
        }

        function runScheduleFilter() {
            var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
            var selectedGroup = groupSelect ? groupSelect.value : "";
            var selectedRoom = roomSelect ? roomSelect.value : "";
            var selectedState = stateSelect ? stateSelect.value : "";
            var hasActive = hasActiveScheduleFilters();
            var visibleContainerCount = 0;

            containers.forEach(function (container) {
                var groupMatch = !selectedGroup || container.getAttribute("data-filter-group") === selectedGroup;
                var items = Array.prototype.slice.call(
                    container.querySelectorAll("[data-teacher-schedule-item]")
                );
                var visibleCount = 0;

                items.forEach(function (item) {
                    var textMatch = item.textContent.toLowerCase().includes(query);
                    var roomMatch = !selectedRoom || item.getAttribute("data-filter-room") === selectedRoom;
                    var stateMatch = !selectedState || item.getAttribute("data-filter-state") === selectedState;
                    var shouldShow = groupMatch && textMatch && roomMatch && stateMatch;

                    if (shouldShow) {
                        item.classList.remove("hidden-by-filter");
                        visibleCount += 1;
                    } else {
                        item.classList.add("hidden-by-filter");
                    }
                });

                var countPill = container.querySelector("[data-teacher-schedule-visible-count]");
                if (countPill) {
                    countPill.textContent = visibleCount + (visibleCount === 1 ? " Class" : " Classes");
                }

                if (visibleCount === 0) {
                    container.classList.add("hidden-by-filter");
                    container.open = false;
                } else {
                    container.classList.remove("hidden-by-filter");
                    visibleContainerCount += 1;

                    if (hasActive) {
                        container.open = true;
                    }
                }
            });

            if (!hasActive) {
                var firstOpenDone = false;

                containers.forEach(function (container) {
                    if (container.classList.contains("hidden-by-filter")) {
                        container.open = false;
                        return;
                    }

                    if (!firstOpenDone) {
                        container.open = true;
                        firstOpenDone = true;
                    } else {
                        container.open = false;
                    }
                });
            }

            if (emptyState) {
                if (visibleContainerCount === 0) {
                    emptyState.classList.remove("hidden-by-filter");
                } else {
                    emptyState.classList.add("hidden-by-filter");
                }
            }
        }

        if (searchInput) {
            searchInput.addEventListener("input", runScheduleFilter);
        }

        [groupSelect, roomSelect, stateSelect].forEach(function (select) {
            if (!select) {
                return;
            }

            select.addEventListener("change", runScheduleFilter);
        });

        if (resetButton) {
            resetButton.addEventListener("click", function () {
                if (searchInput) {
                    searchInput.value = "";
                }

                [groupSelect, roomSelect, stateSelect].forEach(function (select) {
                    if (select) {
                        select.value = "";
                    }
                });

                runScheduleFilter();
            });
        }

        setupAccordionBehavior(containers, hasActiveScheduleFilters);
        runScheduleFilter();
    }

    function setupReportTabs(reportRoot) {
        if (!reportRoot) {
            return;
        }

        var tabs = Array.prototype.slice.call(reportRoot.querySelectorAll("[data-report-tab]"));
        var panels = Array.prototype.slice.call(reportRoot.querySelectorAll("[data-report-panel]"));

        if (!tabs.length || !panels.length) {
            return;
        }

        reportRoot.classList.add("report-tabs-ready");

        function activatePanel(panelKey, shouldUpdateHash) {
            var targetPanel = panels.find(function (panel) {
                return panel.dataset.reportPanel === panelKey;
            });

            if (!targetPanel) {
                return;
            }

            tabs.forEach(function (tab) {
                var isActive = tab.dataset.reportTab === panelKey;
                tab.classList.toggle("is-active", isActive);
                tab.setAttribute("aria-selected", isActive ? "true" : "false");
                tab.tabIndex = isActive ? 0 : -1;
            });

            panels.forEach(function (panel) {
                var isActive = panel.dataset.reportPanel === panelKey;
                panel.classList.toggle("is-active", isActive);
            });

            if (shouldUpdateHash) {
                window.history.replaceState(null, "", "#" + targetPanel.id);
            }
        }

        tabs.forEach(function (tab, index) {
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
            tab.tabIndex = index === 0 ? 0 : -1;

            tab.addEventListener("click", function () {
                activatePanel(tab.dataset.reportTab, true);
            });
        });

        var hashPanel = panels.find(function (panel) {
            return "#" + panel.id === window.location.hash;
        });

        if (hashPanel) {
            activatePanel(hashPanel.dataset.reportPanel, false);
        } else {
            activatePanel("subject-summary", false);
        }
    }

    function setupDetailedRecordFilters(reportRoot) {
        var sectionRoot = reportRoot.querySelector("[data-report-record-directory]");

        if (!sectionRoot) {
            return;
        }

        var searchInput = sectionRoot.querySelector("[data-teacher-record-search]");
        var groupSelect = sectionRoot.querySelector("[data-teacher-record-filter='group']");
        var statusSelect = sectionRoot.querySelector("[data-teacher-record-filter='status']");
        var resetButton = sectionRoot.querySelector("[data-teacher-record-reset]");
        var emptyState = sectionRoot.querySelector("[data-teacher-record-empty]");
        var containers = Array.prototype.slice.call(
            sectionRoot.querySelectorAll("[data-teacher-record-container]")
        );

        if (!containers.length) {
            return;
        }

        function hasActiveFilters() {
            var hasQuery = Boolean(searchInput && searchInput.value.trim().length > 0);
            var hasGroup = Boolean(groupSelect && groupSelect.value);
            var hasStatus = Boolean(statusSelect && statusSelect.value);

            return hasQuery || hasGroup || hasStatus;
        }

        function runFilter() {
            var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
            var selectedGroup = groupSelect ? groupSelect.value : "";
            var selectedStatus = statusSelect ? statusSelect.value : "";
            var hasActive = hasActiveFilters();
            var visibleContainerCount = 0;

            containers.forEach(function (container) {
                var groupMatch = !selectedGroup || container.getAttribute("data-record-group") === selectedGroup;
                var items = Array.prototype.slice.call(
                    container.querySelectorAll("[data-teacher-record-item]")
                );
                var visibleCount = 0;

                items.forEach(function (item) {
                    var textMatch = item.textContent.toLowerCase().includes(query);
                    var statusMatch = !selectedStatus || item.getAttribute("data-filter-status") === selectedStatus;
                    var shouldShow = groupMatch && textMatch && statusMatch;

                    if (shouldShow) {
                        item.classList.remove("hidden-by-filter");
                        visibleCount += 1;
                    } else {
                        item.classList.add("hidden-by-filter");
                    }
                });

                var countPill = container.querySelector("[data-teacher-record-visible-count]");
                if (countPill) {
                    countPill.textContent = visibleCount + (visibleCount === 1 ? " Record" : " Records");
                }

                if (visibleCount === 0) {
                    container.classList.add("hidden-by-filter");
                    container.open = false;
                } else {
                    container.classList.remove("hidden-by-filter");
                    visibleContainerCount += 1;

                    if (hasActive) {
                        container.open = true;
                    }
                }
            });

            if (!hasActive) {
                var firstOpenDone = false;

                containers.forEach(function (container) {
                    if (container.classList.contains("hidden-by-filter")) {
                        container.open = false;
                        return;
                    }

                    if (!firstOpenDone) {
                        container.open = true;
                        firstOpenDone = true;
                    } else {
                        container.open = false;
                    }
                });
            }

            if (emptyState) {
                if (visibleContainerCount === 0) {
                    emptyState.classList.remove("hidden-by-filter");
                } else {
                    emptyState.classList.add("hidden-by-filter");
                }
            }
        }

        if (searchInput) {
            searchInput.addEventListener("input", runFilter);
        }

        [groupSelect, statusSelect].forEach(function (select) {
            if (!select) {
                return;
            }

            select.addEventListener("change", runFilter);
        });

        if (resetButton) {
            resetButton.addEventListener("click", function () {
                if (searchInput) {
                    searchInput.value = "";
                }

                [groupSelect, statusSelect].forEach(function (select) {
                    if (select) {
                        select.value = "";
                    }
                });

                runFilter();
            });
        }

        setupAccordionBehavior(containers, hasActiveFilters);
        runFilter();
    }

    function setupSuspiciousAttemptFilters(reportRoot) {
        var sectionRoot = reportRoot.querySelector("[data-report-attempt-directory]");

        if (!sectionRoot) {
            return;
        }

        var searchInput = sectionRoot.querySelector("[data-teacher-attempt-search]");
        var reasonSelect = sectionRoot.querySelector("[data-teacher-attempt-filter='reason']");
        var resetButton = sectionRoot.querySelector("[data-teacher-attempt-reset]");
        var emptyState = sectionRoot.querySelector("[data-teacher-attempt-empty]");
        var containers = Array.prototype.slice.call(
            sectionRoot.querySelectorAll("[data-teacher-attempt-container]")
        );

        if (!containers.length) {
            return;
        }

        function hasActiveFilters() {
            var hasQuery = Boolean(searchInput && searchInput.value.trim().length > 0);
            var hasReason = Boolean(reasonSelect && reasonSelect.value);

            return hasQuery || hasReason;
        }

        function runFilter() {
            var query = searchInput ? searchInput.value.trim().toLowerCase() : "";
            var selectedReason = reasonSelect ? reasonSelect.value : "";
            var hasActive = hasActiveFilters();
            var visibleContainerCount = 0;

            containers.forEach(function (container) {
                var reasonMatch = !selectedReason || container.getAttribute("data-attempt-reason") === selectedReason;
                var items = Array.prototype.slice.call(
                    container.querySelectorAll("[data-teacher-attempt-item]")
                );
                var visibleCount = 0;

                items.forEach(function (item) {
                    var textMatch = item.textContent.toLowerCase().includes(query);
                    var shouldShow = reasonMatch && textMatch;

                    if (shouldShow) {
                        item.classList.remove("hidden-by-filter");
                        visibleCount += 1;
                    } else {
                        item.classList.add("hidden-by-filter");
                    }
                });

                var countPill = container.querySelector("[data-teacher-attempt-visible-count]");
                if (countPill) {
                    countPill.textContent = visibleCount + (visibleCount === 1 ? " Attempt" : " Attempts");
                }

                if (visibleCount === 0) {
                    container.classList.add("hidden-by-filter");
                    container.open = false;
                } else {
                    container.classList.remove("hidden-by-filter");
                    visibleContainerCount += 1;

                    if (hasActive) {
                        container.open = true;
                    }
                }
            });

            if (!hasActive) {
                var firstOpenDone = false;

                containers.forEach(function (container) {
                    if (container.classList.contains("hidden-by-filter")) {
                        container.open = false;
                        return;
                    }

                    if (!firstOpenDone) {
                        container.open = true;
                        firstOpenDone = true;
                    } else {
                        container.open = false;
                    }
                });
            }

            if (emptyState) {
                if (visibleContainerCount === 0) {
                    emptyState.classList.remove("hidden-by-filter");
                } else {
                    emptyState.classList.add("hidden-by-filter");
                }
            }
        }

        if (searchInput) {
            searchInput.addEventListener("input", runFilter);
        }

        if (reasonSelect) {
            reasonSelect.addEventListener("change", runFilter);
        }

        if (resetButton) {
            resetButton.addEventListener("click", function () {
                if (searchInput) {
                    searchInput.value = "";
                }

                if (reasonSelect) {
                    reasonSelect.value = "";
                }

                runFilter();
            });
        }

        setupAccordionBehavior(containers, hasActiveFilters);
        runFilter();
    }

    function setupReportPage() {
        var reportRoot = document.querySelector(".teacher-reports-page");

        if (!reportRoot) {
            return;
        }

        setupReportTabs(reportRoot);
        setupDetailedRecordFilters(reportRoot);
        setupSuspiciousAttemptFilters(reportRoot);
    }

    document.addEventListener("DOMContentLoaded", function () {
        setupDashboardScheduleFilters();
        setupReportPage();
    });
})();
