document.addEventListener("DOMContentLoaded", function () {
    const subjectForms = document.querySelectorAll(".js-subject-form");

    if (!subjectForms || subjectForms.length === 0) {
        return;
    }

    function showAllTeachers(teacherSelect) {
        Array.from(teacherSelect.options).forEach(function (option) {
            option.hidden = false;
            option.disabled = false;
        });
    }

    function filterTeachersByDepartment(teacherSelect, department) {
        let visibleTeacherCount = 0;

        Array.from(teacherSelect.options).forEach(function (option) {
            if (!option.value) {
                option.hidden = false;
                option.disabled = false;
                option.textContent = "Select Teacher";
                return;
            }

            const teacherDepartment = option.getAttribute("data-department");

            if (!department || teacherDepartment === department) {
                option.hidden = false;
                option.disabled = false;
                visibleTeacherCount++;
            } else {
                option.hidden = true;
                option.disabled = true;
            }
        });

        const selectedOption = teacherSelect.options[teacherSelect.selectedIndex];

        if (selectedOption && selectedOption.disabled) {
            Array.from(teacherSelect.options).forEach(opt => opt.selected = false);
        }

        const placeholder = teacherSelect.querySelector("option[value='']");

        if (placeholder) {
            if (visibleTeacherCount === 0 && department) {
                placeholder.textContent = "No teacher found for " + department;
            } else {
                placeholder.textContent = "Select Teacher";
            }
        }
    }

    function updateSubjectForm(form) {
        const classGroupSelect = form.querySelector(".js-subject-class-group");
        const departmentInput = form.querySelector(".js-subject-department");
        const semesterInput = form.querySelector(".js-subject-semester");
        const teacherSelect = form.querySelector(".js-subject-teacher");

        if (!classGroupSelect || !departmentInput || !semesterInput || !teacherSelect) {
            return;
        }

        const selectedOption = classGroupSelect.options[classGroupSelect.selectedIndex];

        if (!selectedOption || !selectedOption.value) {
            departmentInput.value = "";
            semesterInput.value = "";
            Array.from(teacherSelect.options).forEach(opt => opt.selected = false);
            showAllTeachers(teacherSelect);
            return;
        }

        const department = selectedOption.getAttribute("data-department") || "";
        const semester = selectedOption.getAttribute("data-semester") || "";

        departmentInput.value = department;
        semesterInput.value = semester;

        filterTeachersByDepartment(teacherSelect, department);
    }

    subjectForms.forEach(function (form) {
        const classGroupSelect = form.querySelector(".js-subject-class-group");

        if (!classGroupSelect) {
            return;
        }

        updateSubjectForm(form);

        classGroupSelect.addEventListener("change", function () {
            const teacherSelect = form.querySelector(".js-subject-teacher");

            if (teacherSelect) {
                Array.from(teacherSelect.options).forEach(opt => opt.selected = false);
            }

            updateSubjectForm(form);
        });
    });
});