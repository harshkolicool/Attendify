document.addEventListener("DOMContentLoaded", function () {
    const scheduleForms = document.querySelectorAll(".js-schedule-form");

    if (!scheduleForms || scheduleForms.length === 0) {
        return;
    }

    function updateHint(form, message, type) {
        const hint = form.querySelector(".js-schedule-hint");

        if (!hint) {
            return;
        }

        hint.textContent = message;
        hint.classList.remove("success", "error", "info");

        if (type) {
            hint.classList.add(type);
        }
    }

    function getSelectedOption(select) {
        if (!select || select.selectedIndex < 0) {
            return null;
        }

        return select.options[select.selectedIndex];
    }

    function filterSubjects(form, preserveSelected) {
        const classGroupSelect = form.querySelector(".js-schedule-class-group");
        const subjectSelect = form.querySelector(".js-schedule-subject");
        const teacherSelect = form.querySelector(".js-schedule-teacher");

        if (!classGroupSelect || !subjectSelect || !teacherSelect) {
            return;
        }

        const selectedClassGroupId = classGroupSelect.value;
        const previousSubjectValue = subjectSelect.value;

        let visibleSubjectCount = 0;

        Array.from(subjectSelect.options).forEach(function (option) {
            if (!option.value) {
                option.hidden = false;
                option.disabled = false;
                return;
            }

            const optionClassGroupId = option.getAttribute("data-class-group-id");

            if (selectedClassGroupId && optionClassGroupId === selectedClassGroupId) {
                option.hidden = false;
                option.disabled = false;
                visibleSubjectCount++;
            } else {
                option.hidden = true;
                option.disabled = true;
            }
        });

        if (!selectedClassGroupId) {
            subjectSelect.value = "";
            subjectSelect.disabled = true;
            teacherSelect.value = "";
            teacherSelect.disabled = true;
            updateHint(form, "Select a class group to load its subjects.", "info");
            return;
        }

        subjectSelect.disabled = false;

        if (preserveSelected) {
            subjectSelect.value = previousSubjectValue;
        } else {
            subjectSelect.value = "";
        }

        const selectedSubjectOption = getSelectedOption(subjectSelect);

        if (
            selectedSubjectOption &&
            selectedSubjectOption.value &&
            selectedSubjectOption.disabled
        ) {
            subjectSelect.value = "";
        }

        if (visibleSubjectCount === 0) {
            subjectSelect.value = "";
            teacherSelect.value = "";
            teacherSelect.disabled = true;
            updateHint(form, "No subject found for selected class group.", "error");
            return;
        }

        updateHint(form, "Now select subject and teacher.", "success");
    }

    function filterTeachers(form, preserveSelected) {
        const subjectSelect = form.querySelector(".js-schedule-subject");
        const teacherSelect = form.querySelector(".js-schedule-teacher");

        if (!subjectSelect || !teacherSelect) {
            return;
        }

        const selectedSubjectOption = getSelectedOption(subjectSelect);
        const previousTeacherValue = teacherSelect.value;

        if (!selectedSubjectOption || !selectedSubjectOption.value) {
            teacherSelect.value = "";
            teacherSelect.disabled = true;
            return;
        }

        const teacherIdsText = selectedSubjectOption.getAttribute("data-teacher-ids") || "";

        const allowedTeacherIds = teacherIdsText
            .split(",")
            .map(function (id) {
                return id.trim();
            })
            .filter(Boolean);

        let visibleTeacherCount = 0;

        Array.from(teacherSelect.options).forEach(function (option) {
            if (!option.value) {
                option.hidden = false;
                option.disabled = false;
                return;
            }

            if (allowedTeacherIds.includes(option.value)) {
                option.hidden = false;
                option.disabled = false;
                visibleTeacherCount++;
            } else {
                option.hidden = true;
                option.disabled = true;
            }
        });

        teacherSelect.disabled = false;

        if (preserveSelected) {
            teacherSelect.value = previousTeacherValue;
        } else {
            teacherSelect.value = "";
        }

        const selectedTeacherOption = getSelectedOption(teacherSelect);

        if (
            selectedTeacherOption &&
            selectedTeacherOption.value &&
            selectedTeacherOption.disabled
        ) {
            teacherSelect.value = "";
        }

        if (visibleTeacherCount === 0) {
            teacherSelect.value = "";
            teacherSelect.disabled = true;
            updateHint(form, "No teacher assigned to selected subject.", "error");
            return;
        }
    }

    function validateScheduleDropdowns(form) {
        const classGroupSelect = form.querySelector(".js-schedule-class-group");
        const subjectSelect = form.querySelector(".js-schedule-subject");
        const teacherSelect = form.querySelector(".js-schedule-teacher");

        if (!classGroupSelect.value || !subjectSelect.value || !teacherSelect.value) {
            uiAlert("Please select class group, subject and teacher.");
            return false;
        }

        const selectedSubjectOption = getSelectedOption(subjectSelect);

        if (!selectedSubjectOption) {
            uiAlert("Please select a valid subject.");
            return false;
        }

        const subjectClassGroupId = selectedSubjectOption.getAttribute("data-class-group-id");

        if (subjectClassGroupId !== classGroupSelect.value) {
            uiAlert("Selected subject does not belong to selected class group.");
            return false;
        }

        const allowedTeacherIds = (selectedSubjectOption.getAttribute("data-teacher-ids") || "")
            .split(",")
            .map(function (id) {
                return id.trim();
            })
            .filter(Boolean);

        if (!allowedTeacherIds.includes(teacherSelect.value)) {
            uiAlert("Selected teacher is not assigned to selected subject.");
            return false;
        }

        return true;
    }

    scheduleForms.forEach(function (form) {
        const classGroupSelect = form.querySelector(".js-schedule-class-group");
        const subjectSelect = form.querySelector(".js-schedule-subject");

        filterSubjects(form, true);
        filterTeachers(form, true);

        if (classGroupSelect) {
            classGroupSelect.addEventListener("change", function () {
                filterSubjects(form, false);
                filterTeachers(form, false);
            });
        }

        if (subjectSelect) {
            subjectSelect.addEventListener("change", function () {
                filterTeachers(form, false);
            });
        }

        form.addEventListener("submit", function (event) {
            if (!validateScheduleDropdowns(form)) {
                event.preventDefault();
                return false;
            }

            return true;
        });
    });
});