function cleanValue(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return value.toString().trim();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidObjectIdLike(value) {
    return cleanValue(value).length > 0;
}

function isInteger(value) {
    const numberValue = Number(value);
    return Number.isInteger(numberValue);
}

function isNumber(value) {
    return !Number.isNaN(Number(value));
}

function isSemester(value) {
    const semester = Number(value);
    return Number.isInteger(semester) && semester >= 1 && semester <= 12;
}

function isLatitude(value) {
    const latitude = Number(value);
    return !Number.isNaN(latitude) && latitude >= -90 && latitude <= 90;
}

function isLongitude(value) {
    const longitude = Number(value);
    return !Number.isNaN(longitude) && longitude >= -180 && longitude <= 180;
}

function isRadius(value) {
    const radius = Number(value);
    return !Number.isNaN(radius) && radius >= 1 && radius <= 10000;
}

function timeToMinutes(timeText) {
    if (!timeText || typeof timeText !== "string") {
        return null;
    }

    const rawTime = timeText.trim().toUpperCase();

    const twelveHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

    if (twelveHourMatch) {
        let hours = Number(twelveHourMatch[1]);
        const minutes = Number(twelveHourMatch[2]);
        const period = twelveHourMatch[3];

        if (
            Number.isNaN(hours) ||
            Number.isNaN(minutes) ||
            hours < 1 ||
            hours > 12 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        if (period === "AM" && hours === 12) {
            hours = 0;
        }

        if (period === "PM" && hours !== 12) {
            hours = hours + 12;
        }

        return hours * 60 + minutes;
    }

    const twentyFourHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);

    if (twentyFourHourMatch) {
        const hours = Number(twentyFourHourMatch[1]);
        const minutes = Number(twentyFourHourMatch[2]);

        if (
            Number.isNaN(hours) ||
            Number.isNaN(minutes) ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        return hours * 60 + minutes;
    }

    return null;
}

function getFormField(form, name) {
    return form.elements[name] || null;
}

function getFieldValue(form, name) {
    const field = getFormField(form, name);

    if (!field) {
        return "";
    }

    return cleanValue(field.value);
}

function markInvalid(form, name) {
    const field = getFormField(form, name);

    if (!field) {
        return;
    }

    field.classList.add("admin-field-invalid");
}

function clearInvalidFields(form) {
    const invalidFields = form.querySelectorAll(".admin-field-invalid");

    invalidFields.forEach(function (field) {
        field.classList.remove("admin-field-invalid");
    });
}

function getOrCreateErrorBox(form) {
    let errorBox = form.parentElement.querySelector(".admin-form-error-box");

    if (!errorBox) {
        errorBox = document.createElement("div");
        errorBox.className = "admin-form-error-box";
        form.parentElement.insertBefore(errorBox, form);
    }

    return errorBox;
}

function clearErrorBox(form) {
    const errorBox = form.parentElement.querySelector(".admin-form-error-box");

    if (errorBox) {
        errorBox.remove();
    }
}

function showErrors(form, errors) {
    const errorBox = getOrCreateErrorBox(form);

    errorBox.textContent = "";

    const strong = document.createElement("strong");
    strong.textContent = "Please fix these errors:";

    const list = document.createElement("ul");

    errors.forEach(function (error) {
        const item = document.createElement("li");
        item.textContent = error.message;
        list.appendChild(item);
    });

    errorBox.appendChild(strong);
    errorBox.appendChild(list);
}

function addError(errors, form, fieldName, message) {
    errors.push({
        fieldName: fieldName,
        message: message
    });

    markInvalid(form, fieldName);
}

function focusFirstInvalid(form) {
    const firstInvalid = form.querySelector(".admin-field-invalid");

    if (firstInvalid) {
        firstInvalid.focus();
    }
}

function validateRequired(form, fieldName, label, errors) {
    const value = getFieldValue(form, fieldName);

    if (!value) {
        addError(errors, form, fieldName, label + " is required.");
        return false;
    }

    return true;
}

function validateClassGroupForm(form, errors) {
    validateRequired(form, "name", "Display Name", errors);
    validateRequired(form, "department", "Department", errors);
    validateRequired(form, "section", "Section", errors);

    if (validateRequired(form, "semester", "Semester", errors)) {
        const semester = getFieldValue(form, "semester");

        if (!isSemester(semester)) {
            addError(errors, form, "semester", "Semester must be between 1 and 12.");
        }
    }
}

function validateClassroomForm(form, errors) {
    validateRequired(form, "classroomName", "Classroom Name", errors);
    validateRequired(form, "buildingName", "Building Name", errors);

    if (validateRequired(form, "floorNumber", "Floor Number", errors)) {
        const floorNumber = getFieldValue(form, "floorNumber");

        if (!isInteger(floorNumber)) {
            addError(errors, form, "floorNumber", "Floor number must be a valid integer.");
        }
    }

    if (validateRequired(form, "radius", "Allowed Radius", errors)) {
        const radius = getFieldValue(form, "radius");

        if (!isRadius(radius)) {
            addError(errors, form, "radius", "Radius must be between 1 and 10000 meters.");
        }
    }
}

function validateTeacherForm(form, errors) {
    validateRequired(form, "fullName", "Full Name", errors);

    if (validateRequired(form, "email", "Email", errors)) {
        const email = getFieldValue(form, "email");

        if (!isValidEmail(email)) {
            addError(errors, form, "email", "Enter a valid email address.");
        }
    }

    const password = getFieldValue(form, "password");

    if (form.getAttribute("action").includes("/create")) {
        if (!password) {
            addError(errors, form, "password", "Password is required.");
        } else if (password.length < 6) {
            addError(errors, form, "password", "Password must be at least 6 characters.");
        }
    } else {
        if (password && password.length < 6) {
            addError(errors, form, "password", "Password must be at least 6 characters.");
        }
    }

    validateRequired(form, "employeeId", "Employee ID", errors);
    validateRequired(form, "department", "Department", errors);

    if (validateRequired(form, "role", "Role", errors)) {
        const role = getFieldValue(form, "role").toUpperCase();

        if (role !== "TEACHER" && role !== "HOD") {
            addError(errors, form, "role", "Role must be Teacher or HOD.");
        }
    }
}

function validateStudentForm(form, errors) {
    validateRequired(form, "fullName", "Full Name", errors);

    if (validateRequired(form, "email", "Email", errors)) {
        const email = getFieldValue(form, "email");

        if (!isValidEmail(email)) {
            addError(errors, form, "email", "Enter a valid email address.");
        }
    }

    const password = getFieldValue(form, "password");

    if (form.getAttribute("action").includes("/create")) {
        if (!password) {
            addError(errors, form, "password", "Password is required.");
        } else if (password.length < 6) {
            addError(errors, form, "password", "Password must be at least 6 characters.");
        }
    } else {
        if (password && password.length < 6) {
            addError(errors, form, "password", "Password must be at least 6 characters.");
        }
    }

    validateRequired(form, "enrollmentNumber", "Enrollment Number", errors);
    validateRequired(form, "department", "Department", errors);

    if (validateRequired(form, "semester", "Semester", errors)) {
        const semester = getFieldValue(form, "semester");

        if (!isSemester(semester)) {
            addError(errors, form, "semester", "Semester must be between 1 and 12.");
        }
    }

    if (validateRequired(form, "classGroupId", "Class Group", errors)) {
        const classGroupId = getFieldValue(form, "classGroupId");

        if (!isValidObjectIdLike(classGroupId)) {
            addError(errors, form, "classGroupId", "Please select a valid class group.");
        }
    }
}

function validateSubjectForm(form, errors) {
    validateRequired(form, "subjectName", "Subject Name", errors);
    validateRequired(form, "subjectCode", "Subject Code", errors);
    validateRequired(form, "department", "Department", errors);

    if (validateRequired(form, "semester", "Semester", errors)) {
        const semester = getFieldValue(form, "semester");

        if (!isSemester(semester)) {
            addError(errors, form, "semester", "Semester must be between 1 and 12.");
        }
    }

    validateRequired(form, "classGroupId", "Class Group", errors);

    const teacherSelect = getFormField(form, "teacherIds");

    if (!teacherSelect || teacherSelect.selectedOptions.length === 0) {
        addError(errors, form, "teacherIds", "Select at least one teacher.");
    }
}

function validateScheduleForm(form, errors) {
    validateRequired(form, "classGroupId", "Class Group", errors);
    validateRequired(form, "subjectId", "Subject", errors);
    validateRequired(form, "teacherId", "Teacher", errors);
    validateRequired(form, "classroomId", "Classroom", errors);

    if (validateRequired(form, "date", "Date", errors)) {
        const date = getFieldValue(form, "date");

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            addError(errors, form, "date", "Please enter a valid date.");
        }
    }

    const hasStartTime = validateRequired(form, "startTime", "Start Time", errors);
    const hasEndTime = validateRequired(form, "endTime", "End Time", errors);

    if (hasStartTime && hasEndTime) {
        const startTime = getFieldValue(form, "startTime");
        const endTime = getFieldValue(form, "endTime");

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (startMinutes === null) {
            addError(errors, form, "startTime", "Start time must be valid. Example: 09:00 AM or 09:00.");
        }

        if (endMinutes === null) {
            addError(errors, form, "endTime", "End time must be valid. Example: 10:00 AM or 10:00.");
        }

        if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
            addError(errors, form, "endTime", "End time must be after start time.");
        }
    }
}

function getValidatorForForm(form) {
    const action = form.getAttribute("action") || "";

    if (action.includes("/admin/class-groups/create")) {
        return validateClassGroupForm;
    }

    if (action.includes("/admin/classrooms/create")) {
        return validateClassroomForm;
    }

    if (action.includes("/admin/teachers/create")) {
        return validateTeacherForm;
    }

    if (action.includes("/admin/students/create")) {
        return validateStudentForm;
    }

    if (action.includes("/admin/subjects/create")) {
        return validateSubjectForm;
    }

    if (action.includes("/admin/schedules/create")) {
        return validateScheduleForm;
    }

    if (
        action.includes("/admin/class-groups/") &&
        action.includes("/update")
    ) {
        return validateClassGroupForm;
    }

    if (
        action.includes("/admin/classrooms/") &&
        action.includes("/update")
    ) {
        return validateClassroomForm;
    }

    if (
        action.includes("/admin/subjects/") &&
        action.includes("/update")
    ) {
        return validateSubjectForm;
    }

    if (
        action.includes("/admin/schedules/") &&
        action.includes("/update")
    ) {
        return validateScheduleForm;
    }

    return null;
}

function disableSubmitButton(form) {
    const button = form.querySelector("button[type='submit']");

    if (!button) {
        return;
    }

    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = "Saving...";
}

function setupAdminValidation() {
    const forms = document.querySelectorAll("form");

    forms.forEach(function (form) {
        const validator = getValidatorForForm(form);

        if (!validator) {
            return;
        }

        form.setAttribute("novalidate", "novalidate");

        form.addEventListener("input", function () {
            clearInvalidFields(form);
            clearErrorBox(form);
        });

        form.addEventListener("change", function () {
            clearInvalidFields(form);
            clearErrorBox(form);
        });

        form.addEventListener("submit", function (event) {
            clearInvalidFields(form);
            clearErrorBox(form);

            const errors = [];

            validator(form, errors);

            if (errors.length > 0) {
                event.preventDefault();
                showErrors(form, errors);
                focusFirstInvalid(form);
                return false;
            }

            disableSubmitButton(form);
            return true;
        });
    });
}

document.addEventListener("DOMContentLoaded", setupAdminValidation);
