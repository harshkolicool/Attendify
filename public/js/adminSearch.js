function setupAdminSearch() {
    const searchInputs = document.querySelectorAll("[data-admin-search]");
    const studentFilterInputs = document.querySelectorAll("[data-student-filter]");
    const scheduleFilterInputs = document.querySelectorAll("[data-schedule-filter]");

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
        const query = input ? input.value.toLowerCase().trim() : "";
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
                const itemText = item.innerText.toLowerCase();
                const passesText = itemText.includes(query);

                if (passesText) {
                    item.classList.remove("hidden-by-search");
                } else {
                    item.classList.add("hidden-by-search");
                }
            });

            return;
        }

        containers.forEach(function(container) {
            const passesContainerFilter =
                targetName !== "students" ||
                studentPanelMatchesFilters(container, studentFilterState);

            container.setAttribute("data-filter-match", passesContainerFilter ? "1" : "0");

            const items = container.querySelectorAll("[data-search-group='" + targetName + "']");
            items.forEach(function(item) {
                const itemText = item.innerText.toLowerCase();
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
}

document.addEventListener("DOMContentLoaded", setupAdminSearch);
