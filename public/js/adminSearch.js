function setupAdminSearch() {
    const searchInputs = document.querySelectorAll("[data-admin-search]");
    const studentFilterInputs = document.querySelectorAll("[data-student-filter]");
    const scheduleFilterInputs = document.querySelectorAll("[data-schedule-filter]");
    const studentPageSize = 8;
    const defaultFlatPageSize = 10;
    const flatPageSizeByTarget = {
        teachers: 8,
        subjects: 8,
        "class-groups": 10,
        classrooms: 10
    };
    const flatPageState = {};

    function clampPage(page, totalPages) {
        const safeTotal = Math.max(1, totalPages || 1);
        const numericPage = Number(page || 1);

        if (!Number.isFinite(numericPage) || numericPage < 1) {
            return 1;
        }

        if (numericPage > safeTotal) {
            return safeTotal;
        }

        return Math.floor(numericPage);
    }

    function normalizeSearchText(value) {
        const raw = String(value || "");
        const normalized = typeof raw.normalize === "function"
            ? raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
            : raw;

        return normalized.toLowerCase().replace(/\s+/g, " ").trim();
    }

    function getStudentCardSearchText(item) {
        if (!item) {
            return "";
        }

        const fields = [
            item.getAttribute("data-student-name"),
            item.getAttribute("data-student-email"),
            item.getAttribute("data-student-enrollment")
        ].filter(Boolean).join(" ");

        if (fields.trim()) {
            return normalizeSearchText(fields);
        }

        return normalizeSearchText(item.getAttribute("data-search-text") || "");
    }

    function getSearchableItemText(item, targetName) {
        if (!item) {
            return "";
        }

        if (targetName === "students") {
            return getStudentCardSearchText(item);
        }

        if (item.hasAttribute("data-search-text")) {
            return normalizeSearchText(item.getAttribute("data-search-text"));
        }

        let rawText = "";
        Array.from(item.children).forEach(function(child) {
            if (!child.classList.contains("admin-edit-box")) {
                rawText += " " + child.textContent;
            }
        });

        return normalizeSearchText(rawText);
    }

    function getStudentPage(container) {
        return clampPage(container.getAttribute("data-student-page"), 99999);
    }

    function setStudentPage(container, page) {
        container.setAttribute("data-student-page", String(Math.max(1, page || 1)));
    }

    function createStudentPaginationControls(container) {
        let controls = container.querySelector("[data-student-pagination]");
        if (controls) {
            return controls;
        }

        controls = document.createElement("div");
        controls.className = "admin-student-pagination";
        controls.setAttribute("data-student-pagination", "");
        controls.innerHTML = [
            '<button type="button" class="admin-student-page-btn" data-student-page-prev>Previous</button>',
            '<span class="admin-student-page-meta" data-student-page-meta></span>',
            '<button type="button" class="admin-student-page-btn" data-student-page-next>Next</button>'
        ].join("");

        const grid = container.querySelector(".admin-student-group-grid");
        if (grid && grid.parentNode === container) {
            container.appendChild(controls);
        } else {
            container.appendChild(controls);
        }

        const prevButton = controls.querySelector("[data-student-page-prev]");
        const nextButton = controls.querySelector("[data-student-page-next]");

        if (prevButton) {
            prevButton.addEventListener("click", function() {
                const current = getStudentPage(container);
                setStudentPage(container, Math.max(1, current - 1));
                updateStudentPaginationForContainer(container, false);
            });
        }

        if (nextButton) {
            nextButton.addEventListener("click", function() {
                const current = getStudentPage(container);
                setStudentPage(container, current + 1);
                updateStudentPaginationForContainer(container, false);
            });
        }

        return controls;
    }

    function updateStudentPaginationForContainer(container, resetPage) {
        if (!container) {
            return;
        }

        const allItems = Array.from(container.querySelectorAll("[data-search-group='students']"));
        if (allItems.length === 0) {
            return;
        }

        const matchedItems = allItems.filter(function(item) {
            return !item.classList.contains("hidden-by-search");
        });

        if (resetPage) {
            setStudentPage(container, 1);
        }

        const totalPages = Math.max(1, Math.ceil(matchedItems.length / studentPageSize));
        const currentPage = clampPage(getStudentPage(container), totalPages);
        setStudentPage(container, currentPage);

        const startIndex = (currentPage - 1) * studentPageSize;
        const endIndex = startIndex + studentPageSize;

        allItems.forEach(function(item) {
            item.classList.remove("hidden-by-pagination");
        });

        matchedItems.forEach(function(item, index) {
            const isInCurrentPage = index >= startIndex && index < endIndex;
            if (!isInCurrentPage) {
                item.classList.add("hidden-by-pagination");
            }
        });

        const controls = createStudentPaginationControls(container);
        const prevButton = controls.querySelector("[data-student-page-prev]");
        const nextButton = controls.querySelector("[data-student-page-next]");
        const meta = controls.querySelector("[data-student-page-meta]");

        const shouldShowControls = matchedItems.length > studentPageSize;
        controls.classList.toggle("is-hidden", !shouldShowControls);

        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }

        if (meta) {
            meta.textContent = "Page " + currentPage + " of " + totalPages + " • " +
                matchedItems.length + (matchedItems.length === 1 ? " student" : " students");
        }
    }

    function updateStudentPagination(resetPage) {
        const studentContainers = document.querySelectorAll("[data-search-container='students']");
        studentContainers.forEach(function(container) {
            updateStudentPaginationForContainer(container, resetPage);
        });
    }

    function getFlatPageSize(targetName) {
        return flatPageSizeByTarget[targetName] || defaultFlatPageSize;
    }

    function getFlatPage(targetName) {
        return clampPage(flatPageState[targetName] || 1, 99999);
    }

    function setFlatPage(targetName, page) {
        flatPageState[targetName] = Math.max(1, Number(page || 1));
    }

    function getFlatPaginationControls(targetName, host) {
        if (!host) {
            return null;
        }

        let controls = host.querySelector("[data-flat-pagination='" + targetName + "']");
        if (controls) {
            return controls;
        }

        controls = document.createElement("div");
        controls.className = "admin-flat-pagination";
        controls.setAttribute("data-flat-pagination", targetName);
        controls.innerHTML = [
            '<button type="button" class="admin-student-page-btn" data-flat-page-prev>Previous</button>',
            '<span class="admin-student-page-meta" data-flat-page-meta></span>',
            '<button type="button" class="admin-student-page-btn" data-flat-page-next>Next</button>'
        ].join("");

        host.appendChild(controls);

        const prevButton = controls.querySelector("[data-flat-page-prev]");
        const nextButton = controls.querySelector("[data-flat-page-next]");

        if (prevButton) {
            prevButton.addEventListener("click", function() {
                const current = getFlatPage(targetName);
                setFlatPage(targetName, current - 1);
                updateFlatPagination(targetName, false);
            });
        }

        if (nextButton) {
            nextButton.addEventListener("click", function() {
                const current = getFlatPage(targetName);
                setFlatPage(targetName, current + 1);
                updateFlatPagination(targetName, false);
            });
        }

        return controls;
    }

    function updateFlatPagination(targetName, resetPage) {
        const allItems = Array.from(
            document.querySelectorAll("[data-search-group='" + targetName + "']")
        );

        if (allItems.length === 0) {
            return;
        }

        const firstItem = allItems[0];
        const grid = firstItem.closest(".admin-grid");
        const host = grid ? grid.parentElement : firstItem.parentElement;
        if (!host) {
            return;
        }

        const matchedItems = allItems.filter(function(item) {
            return !item.classList.contains("hidden-by-search");
        });

        if (resetPage) {
            setFlatPage(targetName, 1);
        }

        const pageSize = getFlatPageSize(targetName);
        const totalPages = Math.max(1, Math.ceil(matchedItems.length / pageSize));
        const currentPage = clampPage(getFlatPage(targetName), totalPages);
        setFlatPage(targetName, currentPage);

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;

        allItems.forEach(function(item) {
            item.classList.remove("hidden-by-pagination");
        });

        matchedItems.forEach(function(item, index) {
            const isInCurrentPage = index >= startIndex && index < endIndex;
            if (!isInCurrentPage) {
                item.classList.add("hidden-by-pagination");
            }
        });

        const controls = getFlatPaginationControls(targetName, host);
        if (!controls) {
            return;
        }

        const prevButton = controls.querySelector("[data-flat-page-prev]");
        const nextButton = controls.querySelector("[data-flat-page-next]");
        const meta = controls.querySelector("[data-flat-page-meta]");
        const shouldShowControls = matchedItems.length > pageSize;

        controls.classList.toggle("is-hidden", !shouldShowControls);

        if (prevButton) {
            prevButton.disabled = currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }

        if (meta) {
            meta.textContent = "Page " + currentPage + " of " + totalPages + " • " +
                matchedItems.length + " result" + (matchedItems.length === 1 ? "" : "s");
        }
    }

    function getStudentFilterState() {
        const departmentInput = document.querySelector("[data-student-filter='department']");
        const semesterInput = document.querySelector("[data-student-filter='semester']");
        const classGroupInput = document.querySelector("[data-student-filter='group']");

        const department = departmentInput ? departmentInput.value.trim() : "";
        const semester = semesterInput ? semesterInput.value.trim() : "";
        const classGroup = classGroupInput ? classGroupInput.value.trim() : "";

        return {
            department: department,
            semester: semester,
            classGroup: classGroup,
            hasFilter: Boolean(department || semester || classGroup)
        };
    }

    function getScheduleFilterState() {
        const departmentInput = document.querySelector("[data-schedule-filter='department']");
        const semesterInput = document.querySelector("[data-schedule-filter='semester']");
        const classGroupInput = document.querySelector("[data-schedule-filter='group']");
        const classroomInput = document.querySelector("[data-schedule-filter='classroom']");
        const dayInput = document.querySelector("[data-schedule-filter='day']");

        const department = departmentInput ? departmentInput.value.trim() : "";
        const semester = semesterInput ? semesterInput.value.trim() : "";
        const classGroup = classGroupInput ? classGroupInput.value.trim() : "";
        const classroom = classroomInput ? classroomInput.value.trim() : "";
        const day = dayInput ? dayInput.value.trim() : "";

        return {
            department: department,
            semester: semester,
            classGroup: classGroup,
            classroom: classroom,
            day: day,
            hasFilter: Boolean(department || semester || classGroup || classroom || day)
        };
    }

    function studentPanelMatchesFilters(panel, filterState) {
        if (!panel || !filterState) {
            return true;
        }

        const panelDepartment = (panel.getAttribute("data-filter-department") || "").trim();
        const panelSemester = (panel.getAttribute("data-filter-semester") || "").trim();
        const panelClassGroup = (panel.getAttribute("data-filter-group") || "").trim();

        if (filterState.department && panelDepartment !== filterState.department) {
            return false;
        }

        if (filterState.semester && panelSemester !== filterState.semester) {
            return false;
        }

        if (filterState.classGroup && panelClassGroup !== filterState.classGroup) {
            return false;
        }

        return true;
    }

    function scheduleItemMatchesFilters(item, filterState) {
        if (!item || !filterState) {
            return true;
        }

        const department = (item.getAttribute("data-filter-department") || "").trim();
        const semester = (item.getAttribute("data-filter-semester") || "").trim();
        const classGroup = (item.getAttribute("data-filter-group") || "").trim();
        const classroom = (item.getAttribute("data-filter-classroom") || "").trim();
        const day = (item.getAttribute("data-filter-day") || "").trim();

        if (filterState.department && department !== filterState.department) {
            return false;
        }

        if (filterState.semester && semester !== filterState.semester) {
            return false;
        }

        if (filterState.classGroup && classGroup !== filterState.classGroup) {
            return false;
        }

        if (filterState.classroom && classroom !== filterState.classroom) {
            return false;
        }

        if (filterState.day && day !== filterState.day) {
            return false;
        }

        return true;
    }

    function updateContainerCount(container, targetName, visibleCount) {
        if (targetName === "students") {
            const countElement = container.querySelector("[data-student-visible-count]");
            if (countElement) {
                countElement.textContent = visibleCount + (visibleCount === 1 ? " Student" : " Students");
            }
        }

        if (targetName === "schedules") {
            const countElement = container.querySelector("[data-schedule-visible-count]");
            if (countElement) {
                countElement.textContent = visibleCount + (visibleCount === 1 ? " Schedule" : " Schedules");
            }
        }
    }

    function updateSearchContainers(targetName, shouldAutoExpand) {
        const containers = document.querySelectorAll("[data-search-container='" + targetName + "']");
        let visibleContainerCount = 0;

        containers.forEach(function(container) {
            const filterMatch = container.getAttribute("data-filter-match") !== "0";
            const visibleItems = container.querySelectorAll(
                "[data-search-group='" + targetName + "']:not(.hidden-by-search)"
            );
            const visibleCount = filterMatch ? visibleItems.length : 0;

            updateContainerCount(container, targetName, visibleCount);

            if (visibleCount === 0) {
                container.classList.add("hidden-by-search");
            } else {
                container.classList.remove("hidden-by-search");
                visibleContainerCount += 1;
            }

            if (container.tagName === "DETAILS" && shouldAutoExpand) {
                container.open = visibleCount > 0;
            }
        });

        const emptyState = document.querySelector("[data-search-empty='" + targetName + "']");
        if (emptyState) {
            if (visibleContainerCount === 0) {
                emptyState.classList.remove("hidden-by-search");
            } else {
                emptyState.classList.add("hidden-by-search");
            }
        }
    }

    function runSearch(targetName) {
        const input = document.querySelector("[data-admin-search='" + targetName + "']");
        const query = normalizeSearchText(input ? input.value : "");
        const hasQuery = query.length > 0;

        const studentFilterState =
            targetName === "students" ? getStudentFilterState() : null;
        const scheduleFilterState =
            targetName === "schedules" ? getScheduleFilterState() : null;

        const hasFilters = studentFilterState
            ? studentFilterState.hasFilter
            : (scheduleFilterState ? scheduleFilterState.hasFilter : false);

        const containers = document.querySelectorAll("[data-search-container='" + targetName + "']");

        if (containers.length === 0) {
            const flatItems = document.querySelectorAll("[data-search-group='" + targetName + "']");

            flatItems.forEach(function(item) {
                const itemText = getSearchableItemText(item, targetName);
                const passesText = itemText.includes(query);

                if (passesText) {
                    item.classList.remove("hidden-by-search");
                } else {
                    item.classList.add("hidden-by-search");
                }
            });

            updateFlatPagination(targetName, true);
            return;
        }

        containers.forEach(function(container) {
            const passesContainerFilter =
                targetName !== "students" ||
                studentPanelMatchesFilters(container, studentFilterState);

            container.setAttribute("data-filter-match", passesContainerFilter ? "1" : "0");

            const items = container.querySelectorAll("[data-search-group='" + targetName + "']");
            items.forEach(function(item) {
                const itemText = getSearchableItemText(item, targetName);
                const passesText = itemText.includes(query);
                const passesTargetFilter = targetName !== "schedules" ||
                    scheduleItemMatchesFilters(item, scheduleFilterState);
                const shouldShow = passesContainerFilter && passesText && passesTargetFilter;

                if (shouldShow) {
                    item.classList.remove("hidden-by-search");
                } else {
                    item.classList.add("hidden-by-search");
                }
            });
        });

        updateSearchContainers(targetName, hasQuery || hasFilters);

        if (targetName === "students") {
            updateStudentPagination(true);
        }

        if (!hasQuery && !hasFilters) {
            let firstVisiblePanelOpened = false;

            containers.forEach(function(container) {
                if (container.tagName !== "DETAILS") {
                    return;
                }

                if (container.classList.contains("hidden-by-search")) {
                    container.open = false;
                    return;
                }

                if (!firstVisiblePanelOpened) {
                    container.open = true;
                    firstVisiblePanelOpened = true;
                } else {
                    container.open = false;
                }
            });
        }
    }

    function hasActiveSearchOrFilters(targetName) {
        const searchInput = document.querySelector("[data-admin-search='" + targetName + "']");
        const hasSearchQuery = Boolean(searchInput && searchInput.value.trim().length > 0);

        if (targetName === "students") {
            return hasSearchQuery || getStudentFilterState().hasFilter;
        }

        if (targetName === "schedules") {
            return hasSearchQuery || getScheduleFilterState().hasFilter;
        }

        return hasSearchQuery;
    }

    function setupSingleOpenPanels(targetName) {
        const panels = document.querySelectorAll("details[data-search-container='" + targetName + "']");

        panels.forEach(function(panel) {
            panel.addEventListener("toggle", function() {
                if (!panel.open) {
                    return;
                }

                if (hasActiveSearchOrFilters(targetName)) {
                    return;
                }

                panels.forEach(function(otherPanel) {
                    if (otherPanel !== panel) {
                        otherPanel.open = false;
                    }
                });
            });
        });
    }

    searchInputs.forEach(function(input) {
        const targetName = input.getAttribute("data-admin-search");

        input.addEventListener("input", function() {
            runSearch(targetName);
        });

        runSearch(targetName);
    });

    studentFilterInputs.forEach(function(filterInput) {
        filterInput.addEventListener("change", function() {
            runSearch("students");
        });
    });

    scheduleFilterInputs.forEach(function(filterInput) {
        filterInput.addEventListener("change", function() {
            runSearch("schedules");
        });
    });

    const studentFilterResetButton = document.querySelector("[data-student-filter-reset]");
    if (studentFilterResetButton) {
        studentFilterResetButton.addEventListener("click", function() {
            const studentSearchInput = document.querySelector("[data-admin-search='students']");
            if (studentSearchInput) {
                studentSearchInput.value = "";
            }

            studentFilterInputs.forEach(function(filterInput) {
                filterInput.value = "";
            });

            runSearch("students");
        });
    }

    const scheduleFilterResetButton = document.querySelector("[data-schedule-filter-reset]");
    if (scheduleFilterResetButton) {
        scheduleFilterResetButton.addEventListener("click", function() {
            const scheduleSearchInput = document.querySelector("[data-admin-search='schedules']");
            if (scheduleSearchInput) {
                scheduleSearchInput.value = "";
            }

            scheduleFilterInputs.forEach(function(filterInput) {
                filterInput.value = "";
            });

            runSearch("schedules");
        });
    }

    const scheduleExpandAllButton = document.querySelector("[data-schedule-expand-all]");
    if (scheduleExpandAllButton) {
        scheduleExpandAllButton.addEventListener("click", function() {
            document
                .querySelectorAll("details[data-search-container='schedules']:not(.hidden-by-search)")
                .forEach(function(panel) {
                    panel.open = true;
                });
        });
    }

    const scheduleCollapseAllButton = document.querySelector("[data-schedule-collapse-all]");
    if (scheduleCollapseAllButton) {
        scheduleCollapseAllButton.addEventListener("click", function() {
            document
                .querySelectorAll("details[data-search-container='schedules']")
                .forEach(function(panel) {
                    panel.open = false;
                });
        });
    }

    setupSingleOpenPanels("students");
    setupSingleOpenPanels("schedules");

    updateStudentPagination(true);
    Object.keys(flatPageSizeByTarget).forEach(function(targetName) {
        updateFlatPagination(targetName, true);
    });
}

document.addEventListener("DOMContentLoaded", setupAdminSearch);
