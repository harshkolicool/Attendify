const express = require("express");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    message: "Too many attempts from this IP, please try again after a minute.",
    standardHeaders: true,
    legacyHeaders: false
});

const router = express.Router();
const passport = require("passport");
const mongoose = require("mongoose");
const multer = require("multer");
const College = require("../models/collegeSchema");
const ClassGroup = require("../models/classGroupSchema");
const Classroom = require("../models/classroomSchema");
const Subject = require("../models/subjectSchema");
const Teacher = require("../models/teacherSchema");
const Student = require("../models/studentSchema");
const Schedule = require("../models/scheduleSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const attendanceWindow = require("../utils/attendanceWindow");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const AttendanceAttempt = require("../models/attendanceAttemptSchema");
const PasskeySetupRequest = require("../models/passkeySetupRequestSchema");
const bcrypt = require("bcrypt");
const socketManager = require("../utils/socketManager");
const {
    createNotification,
    getUnreadCount,
    getRecentNotifications,
    markAllRead,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications
} = require("../utils/notificationService");

const {
    timeToMinutes,
    sortSchedulesByDayAndTime
} = require("../utils/scheduleTime");

const isCollegeAdmin = require("../middlewares/isCollegeAdmin");

function getCollegeId(req) {
    if (!req.collegeId) {
        throw new Error("College ID missing from admin request");
    }

    return req.collegeId;
}

function getAdminNotificationFilter(collegeId) {
    return {
        recipientRole: "ADMIN",
        college: collegeId
    };
}

function shouldBroadcastAdminRealtimeRefresh(redirectUrl) {
    if (!redirectUrl || typeof redirectUrl !== "string") {
        return false;
    }

    if (redirectUrl.indexOf("message=") === -1) {
        return false;
    }

    const successMarkers = [
        "message=created",
        "message=updated",
        "message=deleted",
        "message=bulk_deleted",
        "message=student_archived",
        "message=teacher_archived",
        "message=classroom_archived",
        "message=class_group_archived",
        "message=passkeys_reset",
        "message=passkey_setup_allowed",
        "message=passkey_request_approved",
        "message=passkey_request_rejected",
        "message=notifications_read"
    ];

    return successMarkers.some(function (marker) {
        return redirectUrl.includes(marker);
    });
}

router.use(function (req, res, next) {
    const originalRedirect = res.redirect.bind(res);

    res.redirect = function (url) {
        if (
            req.method === "POST" &&
            req.collegeId &&
            shouldBroadcastAdminRealtimeRefresh(url)
        ) {
            socketManager.emitScheduleChanged({
                reason: "admin-data-updated",
                collegeId: req.collegeId
            });
        }

        return originalRedirect(url);
    };

    next();
});

function cleanText(value) {
    if (!value) {
        return "";
    }

    return value.toString().trim();
}

function cleanUpper(value) {
    return cleanText(value).toUpperCase();
}

function cleanEmail(value) {
    return cleanText(value).toLowerCase();
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidNumber(value) {
    return !Number.isNaN(Number(value));
}

function isValidSemester(value) {
    const semester = Number(value);
    return Number.isInteger(semester) && semester >= 1 && semester <= 12;
}

function isValidRadius(value) {
    const radius = Number(value);
    return !Number.isNaN(radius) && radius >= 50 && radius <= 10000;
}

function isValidLatitude(value) {
    const latitude = Number(value);
    return !Number.isNaN(latitude) && latitude >= -90 && latitude <= 90;
}

function isValidLongitude(value) {
    const longitude = Number(value);
    return !Number.isNaN(longitude) && longitude >= -180 && longitude <= 180;
}

function regenerateSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.regenerate(function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.save(function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}

async function loginWithFreshSession(req, user) {
    await regenerateSession(req);

    await new Promise(function (resolve, reject) {
        req.logIn(user, function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });

    await saveSession(req);
}

async function notifyTeacher(teacherId, collegeId, title, message, category, link, metadata) {
    if (!teacherId) {
        return;
    }

    const notification = await createNotification({
        college: collegeId,
        recipientRole: "TEACHER",
        recipientUserId: teacherId,
        title: title,
        message: message,
        category: category || "GENERAL",
        level: "info",
        link: link || "/teacher/dashboard",
        metadata: metadata || {},
        createdByType: "teacher"
    });

    socketManager.emitNotification(notification);

    const unreadCount = await getUnreadCount({
        recipientRole: "TEACHER",
        recipientUserId: teacherId
    });

    socketManager.emitNotificationUnreadCount({
        recipientRole: "TEACHER",
        recipientUserId: teacherId,
        unreadCount: unreadCount
    });
}

function getFlashMessage(code) {
    if (code === "created") return "Record created successfully";
    if (code === "deleted") return "Record deleted successfully";
    if (code === "updated") return "Record updated successfully";

    if (code === "invalid_input") return "Invalid input. Please check all fields.";
    if (code === "invalid_id") return "Invalid record selected.";
    if (code === "invalid_time") return "Invalid schedule time. End time must be after start time.";
    if (code === "invalid_email") return "Invalid email address.";
    if (code === "weak_password") return "Password must be at least 6 characters.";
    if (code === "invalid_role") return "Invalid role selected.";

    if (code === "duplicate_class_group") return "This class group already exists.";
    if (code === "duplicate_classroom") return "This classroom already exists.";
    if (code === "duplicate_subject") return "This subject already exists for this class group.";
    if (code === "duplicate_teacher") return "Teacher email or employee ID already exists.";
    if (code === "duplicate_student") return "Student email or enrollment number already exists.";

    if (code === "invalid_class_group") return "Selected class group does not belong to your college.";
    if (code === "invalid_classroom") return "Selected classroom does not belong to your college.";
    if (code === "invalid_subject") return "Selected subject does not belong to this class group.";
    if (code === "invalid_teacher") return "Selected teacher was not found or is no longer active.";
    if (code === "teacher_not_assigned") return "Selected teacher is not assigned to this subject.";

    if (code === "teacher_clash") return "This teacher already has another class at this time.";
    if (code === "class_clash") return "This class group already has another class at this time.";
    if (code === "room_clash") return "This classroom is already booked at this time.";

    if (code === "active_schedule_session") return "This schedule has an active attendance session right now. End attendance before changing or deleting it.";
    if (code === "active_class_group_session") return "This class group has an active attendance session right now. End attendance before deleting.";
    if (code === "schedule_locked_fields") return "Attendance already exists for this schedule. You can edit day/time, but you cannot change class, subject, teacher, or classroom.";
    if (code === "class_group_archived") return "Class group deleted successfully. Existing attendance history remains intact.";
    
    if (code === "teacher_archived") return "Teacher deleted successfully. Existing attendance history remains intact.";
    if (code === "subject_archived") return "Subject deleted successfully. Existing attendance history remains intact.";
    if (code === "classroom_archived") return "Classroom deleted successfully. Existing attendance history remains intact.";
    if (code === "student_archived") return "Student deleted successfully. Existing attendance history remains intact.";
    if (code === "bulk_deleted") return "Bulk delete completed successfully.";
    if (code === "nothing_to_delete") return "No records found to delete.";
    if (code === "active_teacher_session") return "This teacher has an active attendance session. End the session before deleting.";
    if (code === "active_classroom_session") return "This classroom has an active attendance session. End the session before deleting.";
    if (code === "passkey_setup_allowed") return "Passkey setup allowed for this student for 30 minutes.";
    if (code === "passkey_request_approved") return "Passkey request approved and student notified.";
    if (code === "passkey_request_rejected") return "Passkey request rejected and student notified.";
    if (code === "passkey_request_missing") return "Passkey request not found or already handled.";
    if (code === "notifications_read") return "All notifications marked as read.";
    if (code === "notifications_cleared") return "All notifications deleted.";
    if (code === "notification_deleted") return "Notification deleted.";

    if (code === "in_use") return "This record is linked with existing data, so this action cannot be completed.";
    if (code === "delete_blocked") return "This record cannot be deleted safely.";
    if (code === "error") return "Something went wrong. Please try again.";

    if (code === "passkeys_reset") {
        return "Student passkeys reset successfully.";
    }

    if (code === "updated") {
        return "Schedule updated successfully.";
    }

    if (code === "invalid_time") {
        return "End time must be greater than start time.";
    }

    if (code === "invalid_schedule") {
        return "Schedule not found.";
    }

    if (code === "invalid_subject_class") {
        return "Selected subject does not belong to selected class group.";
    }

    if (code === "teacher_not_assigned") {
        return "Selected teacher is not assigned to this subject.";
    }

    if (code === "teacher_conflict") {
        return "Teacher already has another class at this time.";
    }

    if (code === "class_conflict") {
        return "This class group already has another schedule at this time.";
    }

    if (code === "classroom_conflict") {
        return "This classroom is already booked at this time.";
    }

    if (code === "trusted_device_setup_allowed") {
        return "Trusted browser fallback allowed for this student for 30 minutes.";
    }

    return null;
}

const uploadStudentsCsv = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        if (
            file.mimetype === "text/csv" ||
            file.originalname.toLowerCase().endsWith(".csv")
        ) {
            cb(null, true);
        } else {
            cb(new Error("Only CSV files are allowed"));
        }
    }
});

function csvCleanText(value) {
    if (!value) {
        return "";
    }

    return value.toString().trim();
}

function csvCleanUpper(value) {
    return csvCleanText(value).toUpperCase();
}

function csvCleanEmail(value) {
    return csvCleanText(value).toLowerCase();
}

function csvIsValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const { escapeCsvValue } = require("../utils/csv");

function csvEscape(value) {
    return escapeCsvValue(value);
}

function sendCsvResponse(res, filename, rows) {
    const csvContent = rows.map(function (row) {
        return row.map(csvEscape).join(",");
    }).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=" + filename
    );

    res.send(csvContent);
}

function parseCsvLine(line) {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const character = line[i];
        const nextCharacter = line[i + 1];

        if (character === '"' && insideQuotes && nextCharacter === '"') {
            current += '"';
            i++;
        } else if (character === '"') {
            insideQuotes = !insideQuotes;
        } else if (character === "," && !insideQuotes) {
            values.push(current.trim());
            current = "";
        } else {
            current += character;
        }
    }

    values.push(current.trim());

    return values;
}

function parseStudentsCsv(csvText) {
    const lines = csvText
        .replace(/\r/g, "")
        .split("\n")
        .filter(function (line) {
            return line.trim() !== "";
        });

    if (lines.length < 2) {
        return {
            rows: [],
            errors: ["CSV must contain a header row and at least one student row."]
        };
    }

    const headers = parseCsvLine(lines[0]).map(function (header) {
        return header.trim();
    });

    const requiredHeaders = [
        "fullName",
        "email",
        "password",
        "enrollmentNumber",
        "department",
        "semester",
        "section"
    ];

    const errors = [];

    requiredHeaders.forEach(function (header) {
        if (!headers.includes(header)) {
            errors.push("Missing CSV column: " + header);
        }
    });

    if (errors.length > 0) {
        return {
            rows: [],
            errors: errors
        };
    }

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row = {};

        headers.forEach(function (header, index) {
            row[header] = values[index] || "";
        });

        row.rowNumber = i + 1;
        rows.push(row);
    }

    return {
        rows: rows,
        errors: []
    };
}

function setStudentImportResult(req, result) {
    req.session.studentImportResult = result;
}

function getStudentImportResult(req) {
    const result = req.session.studentImportResult || null;
    req.session.studentImportResult = null;
    return result;
}

function getDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}

function getStartOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T00:00:00") : new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function getEndOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T23:59:59.999") : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
}

function getPercent(part, total) {
    if (!total || total <= 0) {
        return 0;
    }

    return Math.round((part / total) * 100);
}

function safeQueryObjectId(value) {
    if (!value || value === "all") {
        return null;
    }

    if (!isValidObjectId(value)) {
        return null;
    }

    return value;
}

function isStrongPassword(password) {
    if (!password || typeof password !== "string") {
        return false;
    }

    return password.length >= 6;
}

function activeTeacherQuery(extraFilter) {
    return Object.assign(
        {
            role: { $in: ["TEACHER", "HOD"] },
            isBlocked: { $ne: true },
            isDeleted: { $ne: true }
        },
        extraFilter || {}
    );
}

function teacherAccountQuery(extraFilter) {
    return Object.assign(
        {
            role: { $in: ["TEACHER", "HOD"] },
            isDeleted: { $ne: true }
        },
        extraFilter || {}
    );
}

function studentAccountQuery(extraFilter) {
    return Object.assign(
        {
            isDeleted: { $ne: true }
        },
        extraFilter || {}
    );
}

async function forceCloseActiveAttendanceSessions(collegeId, extraFilter) {
    const activeSessionFilter = Object.assign(
        {
            college: collegeId,
            isActive: true,
            status: "ACTIVE"
        },
        extraFilter || {}
    );

    const activeSessions = await AttendanceSession.find(activeSessionFilter).select("_id");

    if (!activeSessions || activeSessions.length === 0) {
        return 0;
    }

    const sessionIds = activeSessions.map(function (session) {
        return session._id;
    });

    const now = new Date();

    await AttendanceSession.updateMany(
        {
            _id: { $in: sessionIds },
            college: collegeId,
            isActive: true,
            status: "ACTIVE"
        },
        {
            $set: {
                isActive: false,
                status: "CANCELLED",
                endTime: now,
                closedAt: now
            }
        }
    );

    return sessionIds.length;
}

async function deleteTeacherRecord(collegeId, teacherId) {
    const teacher = await Teacher.findOne(teacherAccountQuery({
        _id: teacherId,
        college: collegeId
    }));

    if (!teacher) {
        const archivedTeacher = await Teacher.findOne({
            _id: teacherId,
            college: collegeId,
            role: { $in: ["TEACHER", "HOD"] },
            isDeleted: true
        });

        if (archivedTeacher) {
            return { code: "teacher_archived" };
        }

        return { code: "invalid_teacher" };
    }

    await forceCloseActiveAttendanceSessions(collegeId, {
        teacher: teacherId
    });

    const linkedSchedules = await Schedule.find({
        college: collegeId,
        teacher: teacherId
    }).select("_id");

    const linkedScheduleIds = linkedSchedules.map(function (schedule) {
        return schedule._id;
    });

    if (linkedScheduleIds.length > 0) {
        await AttendanceSession.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await AttendanceAttempt.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await Schedule.deleteMany({
            college: collegeId,
            _id: { $in: linkedScheduleIds }
        });
    }

    await Subject.updateMany(
        {
            college: collegeId
        },
        {
            $pull: { teachers: teacher._id }
        }
    );

    const hasAttendanceHistory =
        Boolean(await AttendanceSession.exists({
            college: collegeId,
            teacher: teacherId
        })) ||
        Boolean(await AttendanceAttempt.exists({
            college: collegeId,
            teacher: teacherId
        }));

    if (hasAttendanceHistory) {
        await Teacher.updateOne(
            {
                _id: teacherId,
                college: collegeId,
                role: { $in: ["TEACHER", "HOD"] }
            },
            {
                $set: {
                    email: teacher.email + "_deleted_" + Date.now(),
                    employeeId: teacher.employeeId + "_DELETED_" + Date.now(),
                    isDeleted: true,
                    isBlocked: true,
                    deletedAt: new Date(),
                    subjects: [],
                    attendanceSessions: []
                }
            }
        );

        socketManager.emitScheduleChanged({
            reason: "teacher-archived",
            collegeId: collegeId,
            teacherId: teacherId
        });

        return { code: "teacher_archived" };
    }

    await Teacher.deleteOne({
        _id: teacherId,
        college: collegeId,
        role: { $in: ["TEACHER", "HOD"] }
    });

    socketManager.emitScheduleChanged({
        reason: "teacher-deleted",
        collegeId: collegeId,
        teacherId: teacherId
    });

    return { code: "deleted" };
}

async function deleteClassroomRecord(collegeId, classroomId) {
    const classroom = await Classroom.findOne({
        _id: classroomId,
        college: collegeId,
        isDeleted: { $ne: true }
    });

    if (!classroom) {
        return { code: "invalid_classroom" };
    }

    await forceCloseActiveAttendanceSessions(collegeId, {
        classroom: classroomId
    });

    const linkedSchedules = await Schedule.find({
        college: collegeId,
        classroom: classroomId
    }).select("_id");

    const linkedScheduleIds = linkedSchedules.map(function (schedule) {
        return schedule._id;
    });

    if (linkedScheduleIds.length > 0) {
        await AttendanceSession.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await AttendanceAttempt.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await Schedule.deleteMany({
            college: collegeId,
            _id: { $in: linkedScheduleIds }
        });
    }

    const hasAttendanceHistory =
        Boolean(await AttendanceSession.exists({
            college: collegeId,
            classroom: classroomId
        })) ||
        Boolean(await AttendanceRecord.exists({
            college: collegeId,
            classroom: classroomId
        })) ||
        Boolean(await AttendanceAttempt.exists({
            college: collegeId,
            classroom: classroomId
        }));

    if (hasAttendanceHistory) {
        await Classroom.updateOne(
            {
                _id: classroomId,
                college: collegeId
            },
            {
                $set: {
                    roomNumber: classroom.roomNumber + "_DELETED_" + Date.now(),
                    isDeleted: true,
                    deletedAt: new Date(),
                    students: [],
                    attendanceSessions: []
                }
            }
        );

        socketManager.emitScheduleChanged({
            reason: "classroom-archived",
            collegeId: collegeId,
            classroomId: classroomId
        });

        return { code: "classroom_archived" };
    }

    await Classroom.deleteOne({
        _id: classroomId,
        college: collegeId
    });

    socketManager.emitScheduleChanged({
        reason: "classroom-deleted",
        collegeId: collegeId,
        classroomId: classroomId
    });

    return { code: "deleted" };
}

async function deleteClassGroupRecord(collegeId, classGroupId) {
    const classGroup = await ClassGroup.findOne({
        _id: classGroupId,
        college: collegeId
    });

    if (!classGroup) {
        return { code: "invalid_class_group" };
    }

    const hasStudents = await Student.exists(studentAccountQuery({
        college: collegeId,
        classGroup: classGroupId
    }));

    await forceCloseActiveAttendanceSessions(collegeId, {
        classGroup: classGroupId
    });

    const hasAttendanceHistory =
        Boolean(await AttendanceSession.exists({
            college: collegeId,
            classGroup: classGroupId
        })) ||
        Boolean(await AttendanceRecord.exists({
            college: collegeId,
            classGroup: classGroupId
        })) ||
        Boolean(await AttendanceAttempt.exists({
            college: collegeId,
            classGroup: classGroupId
        }));

    const linkedSchedules = await Schedule.find({
        college: collegeId,
        classGroup: classGroupId
    }).select("_id");

    const linkedScheduleIds = linkedSchedules.map(function (schedule) {
        return schedule._id;
    });

    if (linkedScheduleIds.length > 0) {
        await AttendanceSession.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await AttendanceAttempt.updateMany(
            {
                college: collegeId,
                schedule: { $in: linkedScheduleIds }
            },
            {
                $unset: { schedule: "" }
            }
        );

        await Schedule.deleteMany({
            college: collegeId,
            _id: { $in: linkedScheduleIds }
        });
    }

    if (hasStudents || hasAttendanceHistory) {
        await Subject.updateMany(
            {
                college: collegeId,
                classGroup: classGroupId
            },
            {
                $set: { isActive: false }
            }
        );

        await ClassGroup.updateOne(
            {
                _id: classGroupId,
                college: collegeId
            },
            {
                $set: { 
                    section: classGroup.section + "_ARCHIVED_" + Date.now(),
                    isActive: false 
                }
            }
        );

        socketManager.emitScheduleChanged({
            reason: "class-group-archived",
            collegeId: collegeId,
            classGroupId: classGroupId
        });

        return { code: "class_group_archived" };
    }

    const linkedSubjects = await Subject.find({
        college: collegeId,
        classGroup: classGroupId
    }).select("_id");

    const linkedSubjectIds = linkedSubjects.map(function (subject) {
        return subject._id;
    });

    if (linkedSubjectIds.length > 0) {
        await Teacher.updateMany(
            {
                college: collegeId
            },
            {
                $pull: { subjects: { $in: linkedSubjectIds } }
            }
        );

        await Student.updateMany(
            {
                college: collegeId
            },
            {
                $pull: { subjects: { $in: linkedSubjectIds } }
            }
        );

        await Subject.deleteMany({
            college: collegeId,
            _id: { $in: linkedSubjectIds }
        });
    }

    await ClassGroup.deleteOne({
        _id: classGroupId,
        college: collegeId
    });

    socketManager.emitScheduleChanged({
        reason: "class-group-deleted",
        collegeId: collegeId,
        classGroupId: classGroupId
    });

    return { code: "deleted" };
}

async function deleteSubjectRecord(collegeId, subjectId) {
    const subject = await Subject.findOne({
        _id: subjectId,
        college: collegeId
    });

    if (!subject) {
        return { code: "invalid_subject" };
    }

    const hasSchedules = await Schedule.exists({
        college: collegeId,
        subject: subjectId
    });

    const hasAttendanceSessions = await AttendanceSession.exists({
        college: collegeId,
        subject: subjectId
    });

    if (hasSchedules || hasAttendanceSessions) {
        await Subject.updateOne(
            { _id: subjectId, college: collegeId },
            { 
                $set: { 
                    subjectCode: subject.subjectCode + "_ARCHIVED_" + Date.now(),
                    isActive: false 
                } 
            }
        );
        return { code: "subject_archived" };
    }

    await Teacher.updateMany(
        { college: collegeId },
        { $pull: { subjects: subject._id } }
    );

    await Student.updateMany(
        { college: collegeId },
        { $pull: { subjects: subject._id } }
    );

    await ClassGroup.updateOne(
        { _id: subject.classGroup, college: collegeId },
        { $pull: { subjects: subject._id } }
    );

    await Subject.deleteOne({
        _id: subjectId,
        college: collegeId
    });

    return { code: "deleted" };
}

async function deleteStudentRecord(collegeId, studentId) {
    const student = await Student.findOne(studentAccountQuery({
        _id: studentId,
        college: collegeId
    }));

    if (!student) {
        const archivedStudent = await Student.findOne({
            _id: studentId,
            college: collegeId,
            isDeleted: true
        });

        if (archivedStudent) {
            return { code: "student_archived" };
        }

        return { code: "invalid_id" };
    }

    await ClassGroup.updateOne(
        {
            _id: student.classGroup,
            college: collegeId
        },
        {
            $pull: { students: student._id }
        }
    );

    await Subject.updateMany(
        {
            college: collegeId
        },
        {
            $pull: { students: student._id }
        }
    );

    await PasskeySetupRequest.deleteMany({
        college: collegeId,
        student: student._id
    });

    const hasAttendanceHistory =
        Boolean(await AttendanceRecord.exists({
            college: collegeId,
            student: studentId
        })) ||
        Boolean(await AttendanceAttempt.exists({
            college: collegeId,
            student: studentId
        })) ||
        Boolean(await AttendanceSession.exists({
            college: collegeId,
            $or: [
                { "presentStudents.student": studentId },
                { "absentStudents.student": studentId }
            ]
        }));

    if (hasAttendanceHistory) {
        await Student.updateOne(
            {
                _id: studentId,
                college: collegeId
            },
            {
                $set: {
                    email: student.email + "_deleted_" + Date.now(),
                    enrollmentNumber: student.enrollmentNumber + "_DELETED_" + Date.now(),
                    isDeleted: true,
                    isBlocked: true,
                    deletedAt: new Date(),
                    subjects: [],
                    passkeys: [],
                    trustedDevices: []
                },
                $unset: {
                    passkeySetupAllowedAt: "",
                    passkeySetupAllowedUntil: "",
                    trustedDeviceSetupAllowedAt: "",
                    trustedDeviceSetupAllowedUntil: "",
                    trustedDeviceSetupAllowedBy: ""
                }
            }
        );

        socketManager.emitScheduleChanged({
            reason: "student-archived",
            collegeId: collegeId,
            classGroupId: student.classGroup
        });

        return { code: "student_archived" };
    }

    await Student.deleteOne({
        _id: studentId,
        college: collegeId
    });

    socketManager.emitScheduleChanged({
        reason: "student-deleted",
        collegeId: collegeId,
        classGroupId: student.classGroup
    });

    return { code: "deleted" };
}

router.get("/reports", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const todayInput = getDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            teacherId: req.query.teacherId || "all",
            studentId: req.query.studentId || "all",
            status: req.query.status || "all"
        };

        const fromDate = getStartOfDate(filters.fromDate);
        const toDate = getEndOfDate(filters.toDate);

        const classGroupId = safeQueryObjectId(filters.classGroupId);
        const subjectId = safeQueryObjectId(filters.subjectId);
        const teacherId = safeQueryObjectId(filters.teacherId);
        const studentId = safeQueryObjectId(filters.studentId);

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const subjects = await Subject.find({
            college: collegeId,
            isActive: true
        })
            .populate("classGroup")
            .sort({
                subjectName: 1
            });

        const teachers = await Teacher.find(teacherAccountQuery({
            college: collegeId
        })).sort({
            fullName: 1
        });

        const students = await Student.find(studentAccountQuery({
            college: collegeId
        }))
            .populate("classGroup")
            .sort({
                fullName: 1
            });

        const sessionQuery = {
            college: collegeId,
            startTime: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            sessionQuery.classGroup = classGroupId;
        }

        if (subjectId) {
            sessionQuery.subject = subjectId;
        }

        if (teacherId) {
            sessionQuery.teacher = teacherId;
        }

        const sessions = await AttendanceSession.find(sessionQuery)
            .populate("schedule")
            .populate("subject")
            .populate("teacher")
            .populate("classGroup")
            .populate("classroom")
            .sort({
                startTime: -1
            });

        const sessionIds = sessions.map(function (session) {
            return session._id;
        });

        const recordQuery = {
            college: collegeId,
            attendanceSession: {
                $in: sessionIds
            }
        };

        if (studentId) {
            recordQuery.student = studentId;
        }

        if (filters.status !== "all") {
            recordQuery.status = filters.status;
        }

        const attendanceRecords = await AttendanceRecord.find(recordQuery)
            .populate("student")
            .populate("subject")
            .populate("classGroup")
            .populate("classroom")
            .populate({
                path: "attendanceSession",
                select: "startTime teacher",
                populate: { path: "teacher", select: "fullName" }
            })
            .sort({
                createdAt: -1
            })
            .limit(1000);

        let totalRecords = attendanceRecords.length;
        let totalPresent = 0;
        let totalAbsent = 0;

        const subjectSummaryMap = {};
        const classSummaryMap = {};
        const studentSummaryMap = {};

        attendanceRecords.forEach(function (record) {
            const status = record.status;

            if (status === "PRESENT") {
                totalPresent++;
            }

            if (status === "ABSENT") {
                totalAbsent++;
            }

            const subjectKey = record.subject
                ? record.subject._id.toString()
                : "missing-subject";

            const subjectName = record.subject
                ? record.subject.subjectName
                : "Subject Missing";

            if (!subjectSummaryMap[subjectKey]) {
                subjectSummaryMap[subjectKey] = {
                    name: subjectName,
                    code: record.subject && record.subject.subjectCode ? record.subject.subjectCode : "",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            subjectSummaryMap[subjectKey].total++;

            if (status === "PRESENT") {
                subjectSummaryMap[subjectKey].present++;
            }

            if (status === "ABSENT") {
                subjectSummaryMap[subjectKey].absent++;
            }

            const classKey = record.classGroup
                ? record.classGroup._id.toString()
                : "missing-class";

            const className = record.classGroup
                ? record.classGroup.name
                : "Class Missing";

            if (!classSummaryMap[classKey]) {
                classSummaryMap[classKey] = {
                    name: className,
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            classSummaryMap[classKey].total++;

            if (status === "PRESENT") {
                classSummaryMap[classKey].present++;
            }

            if (status === "ABSENT") {
                classSummaryMap[classKey].absent++;
            }

            const studentKey = record.student
                ? record.student._id.toString()
                : "missing-student";

            const studentName = record.student
                ? record.student.fullName
                : "Student Missing";

            const enrollmentNumber = record.student && record.student.enrollmentNumber
                ? record.student.enrollmentNumber
                : "";

            if (!studentSummaryMap[studentKey]) {
                studentSummaryMap[studentKey] = {
                    name: studentName,
                    enrollmentNumber: enrollmentNumber,
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            studentSummaryMap[studentKey].total++;

            if (status === "PRESENT") {
                studentSummaryMap[studentKey].present++;
            }

            if (status === "ABSENT") {
                studentSummaryMap[studentKey].absent++;
            }
        });

        const subjectSummary = Object.values(subjectSummaryMap).map(function (item) {
            item.percentage = getPercent(item.present, item.total);
            return item;
        });

        const classSummary = Object.values(classSummaryMap).map(function (item) {
            item.percentage = getPercent(item.present, item.total);
            return item;
        });

        const studentSummary = Object.values(studentSummaryMap).map(function (item) {
            item.percentage = getPercent(item.present, item.total);
            return item;
        }).slice(0, 10);

        const attemptQuery = {
            college: collegeId,
            result: {
                $ne: "SUCCESS"
            },
            createdAt: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            attemptQuery.classGroup = classGroupId;
        }

        if (subjectId) {
            attemptQuery.subject = subjectId;
        }

        if (teacherId) {
            attemptQuery.teacher = teacherId;
        }

        if (studentId) {
            attemptQuery.student = studentId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .sort({
                createdAt: -1
            })
            .limit(50);

        const summary = {
            totalSessions: sessions.length,
            totalRecords: totalRecords,
            totalPresent: totalPresent,
            totalAbsent: totalAbsent,
            attendancePercentage: getPercent(totalPresent, totalRecords),
            suspiciousCount: suspiciousAttempts.length
        };

        res.render("admin/reports", {
            admin: req.user,
            activePage: "reports",
            filters: filters,
            classGroups: classGroups,
            subjects: subjects,
            teachers: teachers,
            students: students,
            sessions: sessions,
            attendanceRecords: attendanceRecords,
            suspiciousAttempts: suspiciousAttempts,
            subjectSummary: subjectSummary,
            classSummary: classSummary,
            studentSummary: studentSummary,
            summary: summary,
            message: null
        });

    } catch (err) {
        console.log("ADMIN REPORTS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Admin reports page error: " + "An internal server error occurred.");
    }
});

router.get("/reports/export-attendance", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const todayInput = getDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            teacherId: req.query.teacherId || "all",
            studentId: req.query.studentId || "all",
            status: req.query.status || "all"
        };

        const fromDate = getStartOfDate(filters.fromDate);
        const toDate = getEndOfDate(filters.toDate);

        const classGroupId = safeQueryObjectId(filters.classGroupId);
        const subjectId = safeQueryObjectId(filters.subjectId);
        const teacherId = safeQueryObjectId(filters.teacherId);
        const studentId = safeQueryObjectId(filters.studentId);

        const sessionQuery = {
            college: collegeId,
            startTime: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            sessionQuery.classGroup = classGroupId;
        }

        if (subjectId) {
            sessionQuery.subject = subjectId;
        }

        if (teacherId) {
            sessionQuery.teacher = teacherId;
        }

        const sessions = await AttendanceSession.find(sessionQuery).select("_id");

        const sessionIds = sessions.map(function (session) {
            return session._id;
        });

        const recordQuery = {
            college: collegeId,
            attendanceSession: {
                $in: sessionIds
            }
        };

        if (studentId) {
            recordQuery.student = studentId;
        }

        if (filters.status !== "all") {
            recordQuery.status = filters.status;
        }

        const attendanceRecords = await AttendanceRecord.find(recordQuery)
            .populate("student")
            .populate("subject")
            .populate("classGroup")
            .populate("classroom")
            .populate({
                path: "attendanceSession",
                select: "startTime teacher",
                populate: { path: "teacher", select: "fullName" }
            })
            .sort({
                createdAt: -1
            });

        const rows = [];

        rows.push([
            "Date",
            "Time",
            "Student Name",
            "Enrollment Number",
            "Student Email",
            "Class Group",
            "Subject",
            "Subject Code",
            "Teacher",
            "Classroom",
            "Status",
            "Verification Method",
            "Distance From Teacher/Classroom (m)",
            "GPS Accuracy (m)",
            "Marked At"
        ]);

        attendanceRecords.forEach(function (record) {
            const session = record.attendanceSession;
            const sessionDate = session && session.startTime ? session.startTime : record.createdAt;
            const teacher = session && session.teacher ? session.teacher : null;

            rows.push([
                sessionDate ? new Date(sessionDate).toLocaleDateString() : "",
                sessionDate ? new Date(sessionDate).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                }) : "",

                record.student ? record.student.fullName : "Student Missing",
                record.student && record.student.enrollmentNumber ? record.student.enrollmentNumber : "",
                record.student && record.student.email ? record.student.email : "",

                record.classGroup ? record.classGroup.name : "",
                record.subject ? record.subject.subjectName : "",
                record.subject && record.subject.subjectCode ? record.subject.subjectCode : "",

                teacher ? teacher.fullName : "",

                record.classroom ? record.classroom.classroomName : "",

                record.status || "",
                record.verificationMethod || "",

                record.distanceFromClassroom !== undefined && record.distanceFromClassroom !== null
                    ? Math.round(record.distanceFromClassroom)
                    : "",

                record.deviceInfo && record.deviceInfo.gpsAccuracy
                    ? Math.round(record.deviceInfo.gpsAccuracy)
                    : "",

                record.createdAt ? new Date(record.createdAt).toLocaleString() : ""
            ]);
        });

        const filename =
            "attendance-report-" +
            filters.fromDate +
            "-to-" +
            filters.toDate +
            ".csv";

        sendCsvResponse(res, filename, rows);

    } catch (err) {
        console.log("ADMIN EXPORT ATTENDANCE REPORT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/reports");
    }
});

router.get("/reports/export-suspicious", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const todayInput = getDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            teacherId: req.query.teacherId || "all",
            studentId: req.query.studentId || "all"
        };

        const fromDate = getStartOfDate(filters.fromDate);
        const toDate = getEndOfDate(filters.toDate);

        const classGroupId = safeQueryObjectId(filters.classGroupId);
        const subjectId = safeQueryObjectId(filters.subjectId);
        const teacherId = safeQueryObjectId(filters.teacherId);
        const studentId = safeQueryObjectId(filters.studentId);

        const attemptQuery = {
            college: collegeId,
            result: {
                $ne: "SUCCESS"
            },
            createdAt: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            attemptQuery.classGroup = classGroupId;
        }

        if (subjectId) {
            attemptQuery.subject = subjectId;
        }

        if (teacherId) {
            attemptQuery.teacher = teacherId;
        }

        if (studentId) {
            attemptQuery.student = studentId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .populate("student")
            .populate("attendanceSession")
            .populate("subject")
            .populate("teacher")
            .populate("classGroup")
            .populate("classroom")
            .sort({
                createdAt: -1
            });

        const rows = [];

        rows.push([
            "Date",
            "Time",
            "Student Name",
            "Enrollment Number",
            "Class Group",
            "Subject",
            "Teacher",
            "Classroom",
            "Result",
            "Reason Code",
            "Reason Message",
            "Distance From Teacher (m)",
            "Allowed Radius (m)",
            "GPS Accuracy (m)",
            "Max Allowed Accuracy (m)",
            "Student Latitude",
            "Student Longitude",
            "Teacher Latitude",
            "Teacher Longitude",
            "IP Address",
            "User Agent"
        ]);

        suspiciousAttempts.forEach(function (attempt) {
            rows.push([
                attempt.createdAt ? new Date(attempt.createdAt).toLocaleDateString() : "",
                attempt.createdAt ? new Date(attempt.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                }) : "",

                attempt.studentName || (attempt.student ? attempt.student.fullName : ""),
                attempt.enrollmentNumber || (attempt.student ? attempt.student.enrollmentNumber : ""),

                attempt.classGroup ? attempt.classGroup.name : "",
                attempt.subject ? attempt.subject.subjectName : "",
                attempt.teacher ? attempt.teacher.fullName : "",
                attempt.classroom ? attempt.classroom.classroomName : "",

                attempt.result || "",
                attempt.reasonCode || "",
                attempt.reasonMessage || "",

                Math.round(attempt.distanceFromTeacher || 0),
                Math.round(attempt.allowedRadius || 0),
                Math.round(attempt.gpsAccuracy || 0),
                Math.round(attempt.maxAllowedAccuracy || 0),

                attempt.studentLatitude || "",
                attempt.studentLongitude || "",
                attempt.teacherLatitude || "",
                attempt.teacherLongitude || "",

                attempt.ip || "",
                attempt.userAgent || ""
            ]);
        });

        const filename =
            "suspicious-attendance-attempts-" +
            filters.fromDate +
            "-to-" +
            filters.toDate +
            ".csv";

        sendCsvResponse(res, filename, rows);

    } catch (err) {
        console.log("ADMIN EXPORT SUSPICIOUS ATTEMPTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/reports");
    }
});


router.get("/change-password", isCollegeAdmin, function (req, res) {
    res.render("admin/change-password", {
        admin: req.user,
        activePage: "change-password",
        message: null,
        messageType: null
    });
});

router.post("/change-password", isCollegeAdmin, async function (req, res) {
    try {
        const currentPassword = cleanText(req.body.currentPassword);
        const newPassword = cleanText(req.body.newPassword);
        const confirmPassword = cleanText(req.body.confirmPassword);

        const loggedAdminId = req.user._id || req.user.id;
        const collegeId = req.collegeId || req.user.college;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "All password fields are required.",
                messageType: "error"
            });
        }

        if (newPassword.length < 6) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "New password must be at least 6 characters long.",
                messageType: "error"
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "New password and confirm password do not match.",
                messageType: "error"
            });
        }

        if (currentPassword === newPassword) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "New password cannot be the same as current password.",
                messageType: "error"
            });
        }

        if (!loggedAdminId || !collegeId) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "Admin session is invalid. Please logout and login again.",
                messageType: "error"
            });
        }

        const admin = await Teacher.findOne({
            _id: loggedAdminId,
            role: "ADMIN",
            college: collegeId
        });

        if (!admin) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "Admin account not found.",
                messageType: "error"
            });
        }

        let isPasswordCorrect = false;

        if (admin.password && admin.password.startsWith("$2")) {
            isPasswordCorrect = await bcrypt.compare(currentPassword, admin.password);
        } else {
            isPasswordCorrect = currentPassword === admin.password;
        }

        if (!isPasswordCorrect) {
            return res.render("admin/change-password", {
                admin: req.user,
                activePage: "change-password",
                message: "Current password is incorrect.",
                messageType: "error"
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await Teacher.updateOne(
            {
                _id: admin._id,
                role: "ADMIN",
                college: collegeId
            },
            {
                $set: {
                    password: hashedPassword
                }
            }
        );

        return res.render("admin/change-password", {
            admin: req.user,
            activePage: "change-password",
            message: "Password changed successfully. Please use the new password next time you login.",
            messageType: "success"
        });

    } catch (err) {
        console.log("ADMIN CHANGE PASSWORD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        return res.render("admin/change-password", {
            admin: req.user,
            activePage: "change-password",
            message: "Something went wrong while changing password: "  + " Please try again.",
            messageType: "error"
        });
    }
});


router.get("/login", function (req, res) {
    if (
        req.isAuthenticated() &&
        req.user.accountType === "teacher" &&
        req.user.role === "ADMIN"
    ) {
        return res.redirect("/admin/dashboard");
    }

    res.render("admin/login", {
        error: null
    });
});

router.post("/login", authLimiter, function (req, res, next) {
    passport.authenticate("teacher-local", function (err, user, info) {
        if (err) {
            console.log("ADMIN LOGIN ERROR:", err.message);
            return next(err);
        }

        if (!user) {
            return res.render("admin/login", {
                error: info ? info.message : "Login failed"
            });
        }

        loginWithFreshSession(req, user)
            .then(async function () {
                const teacher = await Teacher.findById(user.id);

                if (!teacher || teacher.role !== "ADMIN") {
                    req.logout(function () {
                        return res.render("admin/login", {
                            error: "This account is not a college admin"
                        });
                    });
                    return;
                }

                return res.redirect("/admin/dashboard");
            })
            .catch(function (loginErr) {
                console.log("ADMIN LOGIN SESSION ERROR:", loginErr.message);
                return next(loginErr);
            });
    })(req, res, next);
});

router.get("/dashboard", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const college = req.college || await College.findById(collegeId);

        const counts = {
            classGroups: await ClassGroup.countDocuments({
                college: collegeId,
                isActive: true
            }),
            classrooms: await Classroom.countDocuments({
                college: collegeId,
                isDeleted: { $ne: true }
            }),
            subjects: await Subject.countDocuments({
                college: collegeId,
                isActive: true
            }),
            teachers: await Teacher.countDocuments({
                college: collegeId,
                role: { $in: ["TEACHER", "HOD"] },
                isDeleted: { $ne: true }
            }),
            students: await Student.countDocuments(studentAccountQuery({ college: collegeId })),
            schedules: await Schedule.countDocuments({ college: collegeId })
        };

        res.render("admin/dashboard", {
            admin: req.user,
            college: college,
            counts: counts,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "dashboard",
            vapidPublicKey: process.env.VAPID_PUBLIC_KEY
        });

    } catch (err) {
        console.log("ADMIN DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Admin dashboard error: "  + " Please try again.");
    }
});

router.get("/notifications", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const notifications = await getRecentNotifications(
            getAdminNotificationFilter(collegeId),
            120
        );

        const unreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        const pendingPasskeyRequests = await PasskeySetupRequest.find({
            college: collegeId,
            status: "PENDING"
        })
            .populate({
                path: "student",
                select: "fullName enrollmentNumber email classGroup department semester",
                populate: {
                    path: "classGroup",
                    select: "name"
                }
            })
            .sort({ createdAt: -1 })
            .lean();

        res.render("admin/notifications", {
            admin: req.user,
            notifications: notifications,
            unreadCount: unreadCount,
            pendingPasskeyRequests: pendingPasskeyRequests,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "notifications"
        });
    } catch (err) {
        console.log("ADMIN NOTIFICATIONS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Admin notifications error: " + "An internal server error occurred.");
    }
});

router.post("/notifications/mark-all-read", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await markAllRead(getAdminNotificationFilter(collegeId));

        const unreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: unreadCount
        });

        res.redirect("/admin/notifications?message=notifications_read");
    } catch (err) {
        console.log("ADMIN MARK ALL NOTIFICATIONS READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications");
    }
});

router.post("/notifications/clear-all", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await clearAllNotifications(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: 0
        });

        res.redirect("/admin/notifications?message=notifications_cleared");
    } catch (err) {
        console.log("ADMIN CLEAR ALL NOTIFICATIONS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications");
    }
});

router.post("/notifications/:id/read", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await markNotificationRead(req.params.id, getAdminNotificationFilter(collegeId));

        const unreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: unreadCount
        });

        res.redirect("/admin/notifications");
    } catch (err) {
        console.log("ADMIN MARK NOTIFICATION READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications");
    }
});

router.post("/notifications/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await deleteNotification(req.params.id, getAdminNotificationFilter(collegeId));

        const unreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: unreadCount
        });

        res.redirect("/admin/notifications?message=notification_deleted");
    } catch (err) {
        console.log("ADMIN DELETE NOTIFICATION ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications");
    }
});

router.get("/notifications/unread-count", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const unreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        res.json({
            success: true,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.log("ADMIN NOTIFICATION COUNT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Unable to load unread notification count."
        });
    }
});

/* ================= CLASS GROUPS ================= */

router.get("/class-groups", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        res.render("admin/classGroups", {
            admin: req.user,
            classGroups: classGroups,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "class-groups"
        });

    } catch (err) {
        console.log("ADMIN CLASS GROUPS ERROR:");
        console.log(err.message);
        res.send("Class groups error: "  + " Please try again.");
    }
});

router.post("/class-groups/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const name = cleanUpper(req.body.name);
        const department = cleanUpper(req.body.department);
        const semester = Number(req.body.semester);
        const section = cleanUpper(req.body.section);

        if (
            !name ||
            !department ||
            !section ||
            !isValidSemester(semester)
        ) {
            return res.redirect("/admin/class-groups?message=invalid_input");
        }

        const existingClassGroup = await ClassGroup.findOne({
            college: collegeId,
            department: department,
            semester: semester,
            section: section
        });

        if (existingClassGroup) {
            if (existingClassGroup.isActive === false) {
                await ClassGroup.updateOne(
                    {
                        _id: existingClassGroup._id,
                        college: collegeId
                    },
                    {
                        $set: {
                            name: name,
                            department: department,
                            semester: semester,
                            section: section,
                            isActive: true
                        }
                    }
                );

                return res.redirect("/admin/class-groups?message=created");
            }

            return res.redirect("/admin/class-groups?message=duplicate_class_group");
        }

        await ClassGroup.create({
            name: name,
            department: department,
            semester: semester,
            section: section,
            college: collegeId,
            students: [],
            subjects: [],
            isActive: true
        });

        res.redirect("/admin/class-groups?message=created");

    } catch (err) {
        console.log("ADMIN CREATE CLASS GROUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/class-groups?message=error");
    }
});


router.post("/classrooms/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classroomId = req.params.id;

        if (!isValidObjectId(classroomId)) {
            return res.redirect("/admin/classrooms?message=invalid_id");
        }

        const classroomName = cleanText(req.body.classroomName);
        const buildingName = cleanText(req.body.buildingName);
        const floorNumber = Number(req.body.floorNumber);
        const radius = Number(req.body.radius) || 100;
        const latitude = req.body.latitude ? Number(req.body.latitude) : 0;
        const longitude = req.body.longitude ? Number(req.body.longitude) : 0;

        if (
            !classroomName ||
            !buildingName ||
            !Number.isInteger(floorNumber) ||
            !isValidRadius(radius)
        ) {
            return res.redirect("/admin/classrooms?message=invalid_input");
        }

        const classroom = await Classroom.findOne({
            _id: classroomId,
            college: collegeId
        });

        if (!classroom) {
            return res.redirect("/admin/classrooms?message=invalid_classroom");
        }

        const duplicateClassroom = await Classroom.findOne({
            _id: { $ne: classroomId },
            college: collegeId,
            classroomName: classroomName,
            buildingName: buildingName,
            floorNumber: floorNumber
        });

        if (duplicateClassroom) {
            return res.redirect("/admin/classrooms?message=duplicate_classroom");
        }

        await Classroom.updateOne(
            {
                _id: classroomId,
                college: collegeId
            },
            {
                $set: {
                    classroomName: classroomName,
                    buildingName: buildingName,
                    floorNumber: floorNumber,
                    radius: radius,
                    latitude: latitude,
                    longitude: longitude
                }
            }
        );

        res.redirect("/admin/classrooms?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE CLASSROOM ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/classrooms?message=error");
    }
});

router.post("/class-groups/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classGroupId = req.params.id;

        if (!isValidObjectId(classGroupId)) {
            return res.redirect("/admin/class-groups?message=invalid_id");
        }

        const name = cleanUpper(req.body.name);
        const department = cleanUpper(req.body.department);
        const semester = Number(req.body.semester);
        const section = cleanUpper(req.body.section);

        if (
            !name ||
            !department ||
            !section ||
            !isValidSemester(semester)
        ) {
            return res.redirect("/admin/class-groups?message=invalid_input");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId
        });

        if (!classGroup) {
            return res.redirect("/admin/class-groups?message=invalid_class_group");
        }

        const duplicateClassGroup = await ClassGroup.findOne({
            _id: { $ne: classGroupId },
            college: collegeId,
            department: department,
            semester: semester,
            section: section
        });

        if (duplicateClassGroup) {
            return res.redirect("/admin/class-groups?message=duplicate_class_group");
        }

        const isChangingCoreFields =
            classGroup.department !== department ||
            Number(classGroup.semester) !== semester ||
            classGroup.section !== section;

        await ClassGroup.updateOne(
            {
                _id: classGroupId,
                college: collegeId
            },
            {
                $set: {
                    name: name,
                    department: department,
                    semester: semester,
                    section: section
                }
            }
        );

        if (isChangingCoreFields) {
            await Student.updateMany(
                {
                    college: collegeId,
                    classGroup: classGroupId
                },
                {
                    $set: {
                        department: department,
                        semester: semester
                    }
                }
            );

            await Subject.updateMany(
                {
                    college: collegeId,
                    classGroup: classGroupId
                },
                {
                    $set: {
                        department: department,
                        semester: semester
                    }
                }
            );
        }

        res.redirect("/admin/class-groups?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE CLASS GROUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/class-groups?message=error");
    }
});

router.post("/class-groups/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classGroupId = req.params.id;

        if (!isValidObjectId(classGroupId)) {
            return res.redirect("/admin/class-groups?message=invalid_id");
        }

        const result = await deleteClassGroupRecord(collegeId, classGroupId);
        res.redirect("/admin/class-groups?message=" + result.code);

    } catch (err) {
        console.log("ADMIN DELETE CLASS GROUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/class-groups?message=error");
    }
});

router.post("/class-groups/delete-all", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).select("_id");

        if (!classGroups || classGroups.length === 0) {
            return res.redirect("/admin/class-groups?message=nothing_to_delete");
        }

        for (let i = 0; i < classGroups.length; i++) {
            await deleteClassGroupRecord(collegeId, classGroups[i]._id);
        }

        res.redirect("/admin/class-groups?message=bulk_deleted");

    } catch (err) {
        console.log("ADMIN BULK DELETE CLASS GROUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/class-groups?message=error");
    }
});

/* ================= CLASSROOMS ================= */

router.get("/classrooms", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classrooms = await Classroom.find({
            college: collegeId,
            isDeleted: { $ne: true }
        }).sort({
            buildingName: 1,
            floorNumber: 1,
            classroomName: 1
        });

        res.render("admin/classrooms", {
            admin: req.user,
            classrooms: classrooms,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "classrooms"
        });

    } catch (err) {
        console.log("ADMIN CLASSROOMS ERROR:");
        console.log(err.message);
        res.send("Classrooms error: "  + " Please try again.");
    }
});

router.post("/classrooms/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classroomName = cleanText(req.body.classroomName);
        const buildingName = cleanText(req.body.buildingName);
        const floorNumber = Number(req.body.floorNumber);
        const radius = Number(req.body.radius) || 100;
        const latitude = req.body.latitude ? Number(req.body.latitude) : 0;
        const longitude = req.body.longitude ? Number(req.body.longitude) : 0;

        if (
            !classroomName ||
            !buildingName ||
            !Number.isInteger(floorNumber) ||
            !isValidRadius(radius) ||
            !isValidLatitude(latitude) ||
            !isValidLongitude(longitude)
        ) {
            return res.redirect("/admin/classrooms?message=invalid_input");
        }

        const existingClassroom = await Classroom.findOne({
            college: collegeId,
            classroomName: classroomName,
            buildingName: buildingName,
            floorNumber: floorNumber
        });

        if (existingClassroom) {
            if (existingClassroom.isDeleted === true) {
                await Classroom.updateOne(
                    {
                        _id: existingClassroom._id,
                        college: collegeId
                    },
                    {
                        $set: {
                            classroomName: classroomName,
                            buildingName: buildingName,
                            floorNumber: floorNumber,
                            radius: radius,
                            latitude: latitude,
                            longitude: longitude,
                            students: [],
                            attendanceSessions: [],
                            isDeleted: false
                        },
                        $unset: {
                            deletedAt: ""
                        }
                    }
                );

                return res.redirect("/admin/classrooms?message=created");
            }

            return res.redirect("/admin/classrooms?message=duplicate_classroom");
        }

        await Classroom.create({
            classroomName: classroomName,
            buildingName: buildingName,
            floorNumber: floorNumber,
            radius: radius,
            latitude: latitude,
            longitude: longitude,
            college: collegeId,
            students: [],
            attendanceSessions: []
        });

        res.redirect("/admin/classrooms?message=created");

    } catch (err) {
        console.log("ADMIN CREATE CLASSROOM ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/classrooms?message=error");
    }
});

router.post("/classrooms/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classroomId = req.params.id;

        if (!isValidObjectId(classroomId)) {
            return res.redirect("/admin/classrooms?message=invalid_id");
        }

        const result = await deleteClassroomRecord(collegeId, classroomId);
        res.redirect("/admin/classrooms?message=" + result.code);

    } catch (err) {
        console.log("ADMIN DELETE CLASSROOM ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/classrooms?message=error");
    }
});

router.post("/classrooms/delete-all", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classrooms = await Classroom.find({
            college: collegeId,
            isDeleted: { $ne: true }
        }).select("_id");

        if (!classrooms || classrooms.length === 0) {
            return res.redirect("/admin/classrooms?message=nothing_to_delete");
        }

        for (let i = 0; i < classrooms.length; i++) {
            await deleteClassroomRecord(collegeId, classrooms[i]._id);
        }

        res.redirect("/admin/classrooms?message=bulk_deleted");

    } catch (err) {
        console.log("ADMIN BULK DELETE CLASSROOM ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/classrooms?message=error");
    }
});


/* ================= SUBJECTS ================= */

router.get("/subjects", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const subjects = await Subject.find({
            college: collegeId,
            isActive: true
        })
        .populate("classGroup")
        .populate("teachers")
        .sort({
            department: 1,
            semester: 1,
            subjectName: 1
        });

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const teachers = await Teacher.find(activeTeacherQuery({
            college: collegeId
        })).sort({
            fullName: 1
        });

        res.render("admin/subjects", {
            admin: req.user,
            subjects: subjects,
            classGroups: classGroups,
            teachers: teachers,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "subjects"
        });

    } catch (err) {
        console.log("ADMIN SUBJECTS ERROR:");
        console.log(err.message);
        res.send("Subjects error: "  + " Please try again.");
    }
});

router.post("/subjects/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const subjectName = cleanUpper(req.body.subjectName);
        const subjectCode = cleanUpper(req.body.subjectCode);
        const department = cleanUpper(req.body.department);
        const semester = Number(req.body.semester);
        const classGroupId = req.body.classGroupId;

        let teacherIds = req.body.teacherIds || [];

        if (!Array.isArray(teacherIds)) {
            teacherIds = [teacherIds];
        }

        teacherIds = teacherIds.filter(function (id) {
            return isValidObjectId(id);
        });

        if (
            !subjectName ||
            !subjectCode ||
            !department ||
            !isValidSemester(semester) ||
            !isValidObjectId(classGroupId) ||
            teacherIds.length === 0
        ) {
            return res.redirect("/admin/subjects?message=invalid_input");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/subjects?message=invalid_class_group");
        }

        const teachers = await Teacher.find(activeTeacherQuery({
            _id: { $in: teacherIds },
            college: collegeId
        }));

        if (teachers.length !== teacherIds.length) {
            return res.redirect("/admin/subjects?message=invalid_teacher");
        }

        const existingSubject = await Subject.findOne({
            college: collegeId,
            classGroup: classGroupId,
            subjectCode: subjectCode
        });

        if (existingSubject) {
            return res.redirect("/admin/subjects?message=duplicate_subject");
        }

        const studentsInClass = await Student.find(studentAccountQuery({
            college: collegeId,
            classGroup: classGroupId
        }));

        const studentIds = studentsInClass.map(function (student) {
            return student._id;
        });

        const subject = await Subject.create({
            subjectName: subjectName,
            subjectCode: subjectCode,
            department: department,
            semester: semester,
            classGroup: classGroupId,
            college: collegeId,
            teachers: teacherIds,
            students: studentIds,
            attendanceSessions: [],
            isActive: true
        });

        await Teacher.updateMany(
            {
                _id: { $in: teacherIds },
                college: collegeId
            },
            {
                $addToSet: { subjects: subject._id }
            }
        );

        await ClassGroup.updateOne(
            {
                _id: classGroupId,
                college: collegeId
            },
            {
                $addToSet: { subjects: subject._id }
            }
        );

        await Student.updateMany(
            {
                college: collegeId,
                classGroup: classGroupId
            },
            {
                $addToSet: { subjects: subject._id }
            }
        );

        res.redirect("/admin/subjects?message=created");

    } catch (err) {
        console.log("ADMIN CREATE SUBJECT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/subjects?message=error");
    }
});

router.post("/subjects/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const subjectId = req.params.id;

        if (!isValidObjectId(subjectId)) {
            return res.redirect("/admin/subjects?message=invalid_id");
        }

        const subjectName = cleanUpper(req.body.subjectName);
        const subjectCode = cleanUpper(req.body.subjectCode);
        const classGroupId = req.body.classGroupId;

        let teacherIds = req.body.teacherIds || [];

        if (!Array.isArray(teacherIds)) {
            teacherIds = [teacherIds];
        }

        teacherIds = teacherIds.filter(function (teacherId) {
            return isValidObjectId(teacherId);
        });

        if (
            !subjectName ||
            !subjectCode ||
            !isValidObjectId(classGroupId) ||
            teacherIds.length === 0
        ) {
            return res.redirect("/admin/subjects?message=invalid_input");
        }

        const subject = await Subject.findOne({
            _id: subjectId,
            college: collegeId
        });

        if (!subject) {
            return res.redirect("/admin/subjects?message=invalid_subject");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/subjects?message=invalid_class_group");
        }

        const teachers = await Teacher.find(activeTeacherQuery({
            _id: { $in: teacherIds },
            college: collegeId
        }));

        if (teachers.length !== teacherIds.length) {
            return res.redirect("/admin/subjects?message=invalid_teacher");
        }

        const duplicateSubject = await Subject.findOne({
            _id: { $ne: subjectId },
            college: collegeId,
            classGroup: classGroupId,
            $or: [
                { subjectName: subjectName },
                { subjectCode: subjectCode }
            ]
        });

        if (duplicateSubject) {
            return res.redirect("/admin/subjects?message=duplicate_subject");
        }

        const oldClassGroupId = subject.classGroup
            ? subject.classGroup.toString()
            : "";

        const newClassGroupId = classGroupId.toString();

        const isChangingClassGroup = oldClassGroupId !== newClassGroupId;

        const hasSchedules = await Schedule.exists({
            college: collegeId,
            subject: subjectId
        });

        const hasAttendanceSessions = await AttendanceSession.exists({
            college: collegeId,
            subject: subjectId
        });

        const hasAttendanceRecords = await AttendanceRecord.exists({
            college: collegeId,
            subject: subjectId
        });

        if (
            isChangingClassGroup &&
            (hasSchedules || hasAttendanceSessions || hasAttendanceRecords)
        ) {
            return res.redirect("/admin/subjects?message=in_use");
        }

        const schedulesUsingSubject = await Schedule.find({
            college: collegeId,
            subject: subjectId
        }).select("teacher");

        const scheduledTeacherIds = schedulesUsingSubject.map(function (schedule) {
            return schedule.teacher.toString();
        });

        const removedScheduledTeacher = scheduledTeacherIds.some(function (teacherId) {
            return !teacherIds.includes(teacherId);
        });

        if (removedScheduledTeacher) {
            return res.redirect("/admin/subjects?message=in_use");
        }

        const studentsInClassGroup = await Student.find(studentAccountQuery({
            college: collegeId,
            classGroup: classGroupId
        })).select("_id");

        const studentIds = studentsInClassGroup.map(function (student) {
            return student._id;
        });

        subject.subjectName = subjectName;
        subject.subjectCode = subjectCode;
        subject.department = classGroup.department;
        subject.semester = classGroup.semester;
        subject.classGroup = classGroup._id;
        subject.teachers = teacherIds;
        subject.students = studentIds;

        await subject.save();

        await Teacher.updateMany(
            {
                college: collegeId,
                subjects: subject._id
            },
            {
                $pull: {
                    subjects: subject._id
                }
            }
        );

        await Teacher.updateMany(
            {
                _id: { $in: teacherIds },
                college: collegeId
            },
            {
                $addToSet: {
                    subjects: subject._id
                }
            }
        );

        if (isChangingClassGroup) {
            await ClassGroup.updateOne(
                {
                    _id: oldClassGroupId,
                    college: collegeId
                },
                {
                    $pull: {
                        subjects: subject._id
                    }
                }
            );

            await ClassGroup.updateOne(
                {
                    _id: classGroupId,
                    college: collegeId
                },
                {
                    $addToSet: {
                        subjects: subject._id
                    }
                }
            );
        }

        await Student.updateMany(
            {
                college: collegeId,
                classGroup: classGroupId
            },
            {
                $addToSet: {
                    subjects: subject._id
                }
            }
        );

        await Student.updateMany(
            {
                college: collegeId,
                classGroup: { $ne: classGroupId },
                subjects: subject._id
            },
            {
                $pull: {
                    subjects: subject._id
                }
            }
        );

        res.redirect("/admin/subjects?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE SUBJECT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/subjects?message=error");
    }
});

router.post("/subjects/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const subjectId = req.params.id;

        if (!isValidObjectId(subjectId)) {
            return res.redirect("/admin/subjects?message=invalid_id");
        }

        const result = await deleteSubjectRecord(collegeId, subjectId);
        res.redirect("/admin/subjects?message=" + result.code);

    } catch (err) {
        console.log("ADMIN DELETE SUBJECT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/subjects?message=error");
    }
});

/* ================= TEACHERS ================= */

router.get("/teachers", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const teachers = await Teacher.find(teacherAccountQuery({
            college: collegeId
        }))
            .populate("subjects")
            .sort({ fullName: 1 });

        const classGroupDepartments = await ClassGroup.distinct("department", {
            college: collegeId,
            isActive: true
        });

        const teacherDepartments = await Teacher.distinct("department", {
            college: collegeId,
            role: { $in: ["TEACHER", "HOD"] },
            isDeleted: { $ne: true }
        });

        const departments = Array.from(
            new Set([
                ...classGroupDepartments,
                ...teacherDepartments
            ])
        ).sort();

        res.render("admin/teachers", {
            admin: req.user,
            teachers: teachers,
            departments: departments,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "teachers"
        });

    } catch (err) {
        console.log("ADMIN TEACHERS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Teachers page error: " + "An internal server error occurred.");
    }
});

router.post("/teachers/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const fullName = cleanText(req.body.fullName);
        const email = cleanEmail(req.body.email);
        const password = cleanText(req.body.password);
        const employeeId = cleanUpper(req.body.employeeId);
        const department = cleanUpper(req.body.department);
        const role = cleanUpper(req.body.role || "TEACHER");

        if (!["TEACHER", "HOD"].includes(role)) {
            return res.redirect("/admin/teachers?message=invalid_role");
        }

        if (!fullName || !email || !password || !employeeId || !department) {
            return res.redirect("/admin/teachers?message=invalid_input");
        }

        if (!isValidEmail(email)) {
            return res.redirect("/admin/teachers?message=invalid_email");
        }

        if (password.length < 6) {
            return res.redirect("/admin/teachers?message=weak_password");
        }

        const activeTeacherConflict = await Teacher.findOne({
            isDeleted: { $ne: true },
            $or: [
                { email: email },
                { college: collegeId, employeeId: employeeId }
            ]
        });

        const existingStudentWithEmail = await Student.findOne(studentAccountQuery({
            email: email
        }));

        if (activeTeacherConflict || existingStudentWithEmail) {
            return res.redirect("/admin/teachers?message=duplicate_teacher");
        }

        const archivedTeacherByEmail = await Teacher.findOne({
            email: email,
            college: collegeId,
            role: { $in: ["TEACHER", "HOD"] },
            isDeleted: true
        });

        const archivedTeacherByEmployeeId = await Teacher.findOne({
            college: collegeId,
            employeeId: employeeId,
            role: { $in: ["TEACHER", "HOD"] },
            isDeleted: true
        });

        if (
            archivedTeacherByEmail &&
            archivedTeacherByEmployeeId &&
            archivedTeacherByEmail._id.toString() !== archivedTeacherByEmployeeId._id.toString()
        ) {
            return res.redirect("/admin/teachers?message=duplicate_teacher");
        }

        const archivedTeacher = archivedTeacherByEmail || archivedTeacherByEmployeeId;

        if (archivedTeacher) {
            archivedTeacher.fullName = fullName;
            archivedTeacher.email = email;
            archivedTeacher.password = password;
            archivedTeacher.employeeId = employeeId;
            archivedTeacher.department = department;
            archivedTeacher.role = role;
            archivedTeacher.subjects = [];
            archivedTeacher.attendanceSessions = [];
            archivedTeacher.isBlocked = false;
            archivedTeacher.isDeleted = false;
            archivedTeacher.deletedAt = undefined;

            await archivedTeacher.save();

            return res.redirect("/admin/teachers?message=created");
        }

        const archivedTeacherConflict = await Teacher.findOne({
            isDeleted: true,
            $or: [
                { email: email },
                { college: collegeId, employeeId: employeeId }
            ]
        });

        if (archivedTeacherConflict) {
            return res.redirect("/admin/teachers?message=duplicate_teacher");
        }

        await Teacher.create({
            fullName: fullName,
            email: email,
            password: password,
            employeeId: employeeId,
            department: department,
            college: collegeId,
            role: role,
            subjects: [],
            attendanceSessions: [],
            isBlocked: false
        });

        res.redirect("/admin/teachers?message=created");

    } catch (err) {
        console.log("ADMIN CREATE TEACHER ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/teachers?message=error");
    }
});


router.post("/teachers/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const teacherId = req.params.id;

        if (!isValidObjectId(teacherId)) {
            return res.redirect("/admin/teachers?message=invalid_id");
        }

        const fullName = cleanText(req.body.fullName);
        const email = cleanEmail(req.body.email);
        const employeeId = cleanUpper(req.body.employeeId);
        const department = cleanUpper(req.body.department);
        const role = cleanUpper(req.body.role || "TEACHER");
        const password = cleanText(req.body.password);

        if (!["TEACHER", "HOD"].includes(role)) {
            return res.redirect("/admin/teachers?message=invalid_role");
        }

        if (!fullName || !email || !employeeId || !department) {
            return res.redirect("/admin/teachers?message=invalid_input");
        }

        if (!isValidEmail(email)) {
            return res.redirect("/admin/teachers?message=invalid_email");
        }

        if (password && password.length < 6) {
            return res.redirect("/admin/teachers?message=weak_password");
        }

        const teacher = await Teacher.findOne(teacherAccountQuery({
            _id: teacherId,
            college: collegeId
        }));

        if (!teacher) {
            const archivedTeacher = await Teacher.findOne({
                _id: teacherId,
                college: collegeId,
                role: { $in: ["TEACHER", "HOD"] },
                isDeleted: true
            });

            if (archivedTeacher) {
                return res.redirect("/admin/teachers?message=teacher_archived");
            }

            return res.redirect("/admin/teachers?message=invalid_teacher");
        }

        const duplicateTeacher = await Teacher.findOne({
            _id: { $ne: teacherId },
            $or: [
                { email: email },
                { college: collegeId, employeeId: employeeId }
            ]
        });

        const duplicateStudentEmail = await Student.findOne(studentAccountQuery({
            email: email
        }));

        if (duplicateTeacher || duplicateStudentEmail) {
            return res.redirect("/admin/teachers?message=duplicate_teacher");
        }

        teacher.fullName = fullName;
        teacher.email = email;
        teacher.employeeId = employeeId;
        teacher.department = department;
        teacher.role = role;

        if (password) {
            teacher.password = password;
        }

        await teacher.save();

        res.redirect("/admin/teachers?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE TEACHER ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/teachers?message=error");
    }
});


router.post("/teachers/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const teacherId = req.params.id;

        if (!isValidObjectId(teacherId)) {
            return res.redirect("/admin/teachers?message=invalid_id");
        }

        const result = await deleteTeacherRecord(collegeId, teacherId);
        res.redirect("/admin/teachers?message=" + result.code);

    } catch (err) {
        console.log("ADMIN DELETE TEACHER ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/teachers?message=error");
    }
});

router.post("/teachers/delete-all", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const teachers = await Teacher.find(teacherAccountQuery({
            college: collegeId
        })).select("_id");

        if (!teachers || teachers.length === 0) {
            return res.redirect("/admin/teachers?message=nothing_to_delete");
        }

        for (let i = 0; i < teachers.length; i++) {
            await deleteTeacherRecord(collegeId, teachers[i]._id);
        }

        res.redirect("/admin/teachers?message=bulk_deleted");

    } catch (err) {
        console.log("ADMIN BULK DELETE TEACHER ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/teachers?message=error");
    }
});


/* ================= STUDENTS ================= */

router.get("/students/pending", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        
        const pendingStudents = await Student.find({
            college: collegeId,
            isApproved: false,
            isDeleted: { $ne: true }
        }).sort({ createdAt: -1 }).lean();

        res.render("admin/pendingStudents", {
            activePage: "pendingStudents",
            message: req.query.message || null,
            pendingStudents
        });
    } catch (err) {
        console.error("ADMIN GET PENDING STUDENTS ERROR:", err);
        res.redirect("/admin/dashboard?message=error");
    }
});

router.get("/students/pending/json", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        
        const pendingStudents = await Student.find({
            college: collegeId,
            isApproved: false,
            isDeleted: { $ne: true }
        }).sort({ createdAt: -1 }).lean();

        res.json({ success: true, pendingStudents });
    } catch (err) {
        console.error("ADMIN GET PENDING STUDENTS JSON ERROR:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

router.post("/students/approve/:id", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students/pending?message=invalid_id");
        }

        const student = await Student.findOneAndUpdate(
            { _id: studentId, college: collegeId, isDeleted: { $ne: true } },
            { $set: { isApproved: true, autoLoginToken: null } },
            { new: true }
        );

        if (!student) {
            return res.redirect("/admin/students/pending?message=invalid_student");
        }

        socketManager.emitStudentApproved(studentId, collegeId);

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ success: true, message: "Student approved successfully" });
        }
        res.redirect("/admin/students/pending?message=student_approved_successfully");

    } catch (err) {
        console.error("ADMIN APPROVE STUDENT ERROR:", err);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ success: false, error: "Server error" });
        }
        res.redirect("/admin/students/pending?message=error");
    }
});

router.get("/students", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const students = await Student.find(studentAccountQuery({
            college: collegeId
        }))
        .populate("classGroup")
        .sort({
            fullName: 1
        });

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const schedules = await Schedule.find({
            college: collegeId
        })
        .select("classGroup classroom")
        .populate({
            path: "classGroup",
            select: "_id"
        })
        .populate({
            path: "classroom",
            select: "classroomName"
        });

        const classroomsByClassGroup = {};

        schedules.forEach(function (scheduleItem) {
            if (
                !scheduleItem ||
                !scheduleItem.classGroup ||
                !scheduleItem.classGroup._id ||
                !scheduleItem.classroom ||
                !scheduleItem.classroom.classroomName
            ) {
                return;
            }

            const classGroupId = scheduleItem.classGroup._id.toString();
            const classroomName = scheduleItem.classroom.classroomName.toString();

            if (!classroomsByClassGroup[classGroupId]) {
                classroomsByClassGroup[classGroupId] = [];
            }

            if (!classroomsByClassGroup[classGroupId].includes(classroomName)) {
                classroomsByClassGroup[classGroupId].push(classroomName);
            }
        });

        Object.keys(classroomsByClassGroup).forEach(function (classGroupId) {
            classroomsByClassGroup[classGroupId].sort();
        });

        res.render("admin/students", {
            admin: req.user,
            students: students,
            classGroups: classGroups,
            classroomsByClassGroup: classroomsByClassGroup,
            message: getFlashMessage(req.query.message),
            csvImportResult: getStudentImportResult(req),
            error: null,
            activePage: "students",
        });

    } catch (err) {
        console.log("ADMIN STUDENTS ERROR:");
        console.log(err.message);
        res.send("Students error: "  + " Please try again.");
    }
});

router.post("/students/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const fullName = cleanText(req.body.fullName);
        const email = cleanEmail(req.body.email);
        const password = cleanText(req.body.password);
        const enrollmentNumber = cleanUpper(req.body.enrollmentNumber);
        const department = cleanUpper(req.body.department);
        const semester = Number(req.body.semester);
        const classGroupId = req.body.classGroupId;

        if (
            !fullName ||
            !email ||
            !password ||
            !enrollmentNumber ||
            !department ||
            !isValidSemester(semester) ||
            !isValidObjectId(classGroupId)
        ) {
            return res.redirect("/admin/students?message=invalid_input");
        }

        if (!isValidEmail(email)) {
            return res.redirect("/admin/students?message=invalid_email");
        }

        if (password.length < 6) {
            return res.redirect("/admin/students?message=weak_password");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/students?message=invalid_class_group");
        }

        const existingStudent = await Student.findOne({
            $or: [
                { email: email },
                { college: collegeId, enrollmentNumber: enrollmentNumber }
            ]
        });

        const existingTeacherWithEmail = await Teacher.findOne({
            email: email
        });

        if (existingTeacherWithEmail) {
            return res.redirect("/admin/students?message=duplicate_student");
        }

        const subjectsInGroup = await Subject.find({
            college: collegeId,
            classGroup: classGroupId,
            isActive: true
        });

        const subjectIds = subjectsInGroup.map(function (subject) {
            return subject._id;
        });

        if (existingStudent) {
            const existingStudentCollegeId = existingStudent.college
                ? existingStudent.college.toString()
                : "";

            if (
                existingStudent.isDeleted === true &&
                existingStudentCollegeId === collegeId.toString()
            ) {
                existingStudent.fullName = fullName;
                existingStudent.email = email;
                existingStudent.password = password;
                existingStudent.enrollmentNumber = enrollmentNumber;
                existingStudent.department = department;
                existingStudent.semester = semester;
                existingStudent.classGroup = classGroupId;
                existingStudent.subjects = subjectIds;
                existingStudent.isBlocked = false;
                existingStudent.isDeleted = false;
                existingStudent.deletedAt = undefined;
                existingStudent.passkeys = [];
                existingStudent.trustedDevices = [];
                existingStudent.passkeySetupAllowedAt = undefined;
                existingStudent.passkeySetupAllowedUntil = undefined;
                existingStudent.trustedDeviceSetupAllowedAt = undefined;
                existingStudent.trustedDeviceSetupAllowedUntil = undefined;
                existingStudent.trustedDeviceSetupAllowedBy = undefined;

                await existingStudent.save();
                await PasskeySetupRequest.deleteMany({
                    college: collegeId,
                    student: existingStudent._id
                });

                await ClassGroup.updateMany(
                    {
                        college: collegeId
                    },
                    {
                        $pull: { students: existingStudent._id }
                    }
                );

                await Subject.updateMany(
                    {
                        college: collegeId
                    },
                    {
                        $pull: { students: existingStudent._id }
                    }
                );

                await ClassGroup.updateOne(
                    {
                        _id: classGroupId,
                        college: collegeId
                    },
                    {
                        $addToSet: { students: existingStudent._id }
                    }
                );

                await Subject.updateMany(
                    {
                        _id: { $in: subjectIds },
                        college: collegeId
                    },
                    {
                        $addToSet: { students: existingStudent._id }
                    }
                );

                socketManager.emitScheduleChanged({
                    reason: "student-restored",
                    collegeId: collegeId,
                    classGroupId: classGroupId
                });

                return res.redirect("/admin/students?message=created");
            }

            return res.redirect("/admin/students?message=duplicate_student");
        }

        const student = await Student.create({
            fullName: fullName,
            email: email,
            password: password,
            enrollmentNumber: enrollmentNumber,
            department: department,
            semester: semester,
            college: collegeId,
            classGroup: classGroupId,
            subjects: subjectIds,
            isBlocked: false
        });

        await ClassGroup.updateOne(
            {
                _id: classGroupId,
                college: collegeId
            },
            {
                $addToSet: { students: student._id }
            }
        );

        await Subject.updateMany(
            {
                _id: { $in: subjectIds },
                college: collegeId
            },
            {
                $addToSet: { students: student._id }
            }
        );

        socketManager.emitScheduleChanged({
            reason: "student-created",
            collegeId: collegeId,
            classGroupId: classGroupId
        });

        res.redirect("/admin/students?message=created");

    } catch (err) {
        console.log("ADMIN CREATE STUDENT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});

router.post("/students/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const fullName = cleanText(req.body.fullName);
        const email = cleanEmail(req.body.email);
        const password = cleanText(req.body.password);
        const enrollmentNumber = cleanUpper(req.body.enrollmentNumber);
        const department = cleanUpper(req.body.department);
        const semester = Number(req.body.semester);
        const classGroupId = req.body.classGroupId;

        if (
            !fullName ||
            !email ||
            !enrollmentNumber ||
            !department ||
            !isValidSemester(semester) ||
            !isValidObjectId(classGroupId)
        ) {
            return res.redirect("/admin/students?message=invalid_input");
        }

        if (!isValidEmail(email)) {
            return res.redirect("/admin/students?message=invalid_email");
        }

        if (password && password.length < 6) {
            return res.redirect("/admin/students?message=weak_password");
        }

        const student = await Student.findOne(studentAccountQuery({
            _id: studentId,
            college: collegeId
        }));

        if (!student) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/students?message=invalid_class_group");
        }

        const duplicateStudent = await Student.findOne({
            _id: { $ne: studentId },
            isDeleted: { $ne: true },
            $or: [
                { email: email },
                { college: collegeId, enrollmentNumber: enrollmentNumber }
            ]
        });

        const duplicateTeacherEmail = await Teacher.findOne({
            email: email
        });

        if (duplicateStudent || duplicateTeacherEmail) {
            return res.redirect("/admin/students?message=duplicate_student");
        }

        const oldClassGroupId = student.classGroup ? student.classGroup.toString() : "";
        const newClassGroupId = classGroupId.toString();

        const isChangingClassGroup = oldClassGroupId !== newClassGroupId;

        const subjectsInNewClass = await Subject.find({
            college: collegeId,
            classGroup: classGroupId,
            isActive: true
        });

        const newSubjectIds = subjectsInNewClass.map(function (subject) {
            return subject._id;
        });

        student.fullName = fullName;
        student.email = email;
        student.enrollmentNumber = enrollmentNumber;
        student.department = department;
        student.semester = semester;
        student.classGroup = classGroupId;
        student.subjects = newSubjectIds;

        if (password) {
            student.password = password;
        }

        await student.save();

        if (isChangingClassGroup) {
            await ClassGroup.updateMany(
                {
                    college: collegeId
                },
                {
                    $pull: { students: student._id }
                }
            );

            await Subject.updateMany(
                {
                    college: collegeId
                },
                {
                    $pull: { students: student._id }
                }
            );

            await ClassGroup.updateOne(
                {
                    _id: classGroupId,
                    college: collegeId
                },
                {
                    $addToSet: { students: student._id }
                }
            );

            await Subject.updateMany(
                {
                    _id: { $in: newSubjectIds },
                    college: collegeId
                },
                {
                    $addToSet: { students: student._id }
                }
            );
        }

        socketManager.emitScheduleChanged({
            reason: "student-updated",
            collegeId: collegeId,
            classGroupId: classGroupId
        });

        res.redirect("/admin/students?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE STUDENT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});

router.post("/students/:id/reset-passkeys", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const student = await Student.findOne(studentAccountQuery({
            _id: studentId,
            college: collegeId
        }));

        if (!student) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        await Student.updateOne(
            {
                _id: studentId,
                college: collegeId
            },
            {
                $set: {
                    passkeys: [],
                    trustedDevices: [],
                    passkeySetupAllowedAt: new Date(),
                    passkeySetupAllowedUntil: new Date(Date.now() + 30 * 60 * 1000),
                    passkeySetupAllowedBy: req.user._id
                }
            }
        );

        await PasskeySetupRequest.updateMany(
            {
                college: collegeId,
                student: studentId,
                status: "PENDING"
            },
            {
                $set: {
                    status: "APPROVED",
                    reviewedAt: new Date(),
                    reviewedBy: req.user._id,
                    reviewNote: "Approved automatically when admin reset passkeys."
                }
            }
        );

        const studentNotification = await createNotification({
            college: collegeId,
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            title: "Passkeys reset by admin",
            message: "Your passkeys were reset. You can register a new passkey for 30 minutes.",
            category: "PASSKEY_SETUP",
            level: "warning",
            link: "/student/passkeys",
            createdByType: "teacher",
            createdById: req.user._id
        });

        socketManager.emitNotification(studentNotification);

        const studentUnreadCount = await getUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            unreadCount: studentUnreadCount
        });

        socketManager.emitPasskeyStateChanged(student._id, {
            message: "Your passkeys were reset. Refreshing...",
            toast: "Your passkeys were reset."
        });

        res.redirect("/admin/students?message=passkeys_reset");

    } catch (err) {
        console.log("ADMIN RESET STUDENT PASSKEYS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});

router.post("/passkey-requests/:id/approve", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const requestId = req.params.id;

        if (!isValidObjectId(requestId)) {
            return res.redirect("/admin/notifications?message=passkey_request_missing");
        }

        const request = await PasskeySetupRequest.findOne({
            _id: requestId,
            college: collegeId,
            status: "PENDING"
        }).populate("student");

        if (!request || !request.student) {
            return res.redirect("/admin/notifications?message=passkey_request_missing");
        }

        await Student.updateOne(
            {
                _id: request.student._id,
                college: collegeId
            },
            {
                $set: {
                    passkeySetupAllowedAt: new Date(),
                    passkeySetupAllowedUntil: new Date(Date.now() + 30 * 60 * 1000),
                    passkeySetupAllowedBy: req.user._id
                }
            }
        );

        request.status = "APPROVED";
        request.reviewedAt = new Date();
        request.reviewedBy = req.user._id;
        request.reviewNote = cleanText(req.body.reviewNote);

        await request.save();

        const studentNotification = await createNotification({
            college: collegeId,
            recipientRole: "STUDENT",
            recipientUserId: request.student._id,
            title: "Passkey request approved",
            message: "Your passkey setup request was approved. You can now register a new passkey for 30 minutes.",
            category: "PASSKEY_REQUEST",
            level: "success",
            link: "/student/passkeys",
            metadata: {
                requestId: request._id.toString()
            },
            createdByType: "teacher",
            createdById: req.user._id
        });

        socketManager.emitNotification(studentNotification);

        const studentUnreadCount = await getUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: request.student._id
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: request.student._id,
            unreadCount: studentUnreadCount
        });

        socketManager.emitPasskeyStateChanged(request.student._id, {
            message: "Passkey setup approved. Refreshing...",
            toast: "Passkey setup approved."
        });

        const adminUnreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: adminUnreadCount
        });

        res.redirect("/admin/notifications?message=passkey_request_approved");
    } catch (err) {
        console.log("ADMIN APPROVE PASSKEY REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications?message=error");
    }
});

router.post("/passkey-requests/:id/reject", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const requestId = req.params.id;

        if (!isValidObjectId(requestId)) {
            return res.redirect("/admin/notifications?message=passkey_request_missing");
        }

        const request = await PasskeySetupRequest.findOne({
            _id: requestId,
            college: collegeId,
            status: "PENDING"
        }).populate("student");

        if (!request || !request.student) {
            return res.redirect("/admin/notifications?message=passkey_request_missing");
        }

        const reviewNote = cleanText(req.body.reviewNote);

        request.status = "REJECTED";
        request.reviewedAt = new Date();
        request.reviewedBy = req.user._id;
        request.reviewNote = reviewNote;

        await request.save();

        const studentNotification = await createNotification({
            college: collegeId,
            recipientRole: "STUDENT",
            recipientUserId: request.student._id,
            title: "Passkey request rejected",
            message:
                "Your passkey setup request was rejected." +
                (reviewNote ? " Reason: " + reviewNote : ""),
            category: "PASSKEY_REQUEST",
            level: "danger",
            link: "/student/passkeys",
            metadata: {
                requestId: request._id.toString()
            },
            createdByType: "teacher",
            createdById: req.user._id
        });

        socketManager.emitNotification(studentNotification);

        const studentUnreadCount = await getUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: request.student._id
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: request.student._id,
            unreadCount: studentUnreadCount
        });

        socketManager.emitPasskeyStateChanged(request.student._id, {
            message: "Passkey setup rejected. Refreshing...",
            toast: "Passkey setup request rejected."
        });

        const adminUnreadCount = await getUnreadCount(getAdminNotificationFilter(collegeId));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "ADMIN",
            collegeId: collegeId,
            unreadCount: adminUnreadCount
        });

        res.redirect("/admin/notifications?message=passkey_request_rejected");
    } catch (err) {
        console.log("ADMIN REJECT PASSKEY REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/notifications?message=error");
    }
});


router.post("/students/:id/allow-passkey-setup", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const student = await Student.findOne(studentAccountQuery({
            _id: studentId,
            college: collegeId
        }));

        if (!student) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        student.passkeySetupAllowedAt = new Date();
        student.passkeySetupAllowedUntil = new Date(Date.now() + 30 * 60 * 1000);
        student.passkeySetupAllowedBy = req.user._id;

        await student.save();

        await PasskeySetupRequest.updateMany(
            {
                college: collegeId,
                student: studentId,
                status: "PENDING"
            },
            {
                $set: {
                    status: "APPROVED",
                    reviewedAt: new Date(),
                    reviewedBy: req.user._id,
                    reviewNote: "Approved from allow-passkey-setup action."
                }
            }
        );

        const studentNotification = await createNotification({
            college: collegeId,
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            title: "Passkey setup approved",
            message: "Your admin allowed passkey setup for 30 minutes. Register now.",
            category: "PASSKEY_SETUP",
            level: "success",
            link: "/student/passkeys",
            createdByType: "teacher",
            createdById: req.user._id
        });

        socketManager.emitNotification(studentNotification);

        const studentUnreadCount = await getUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            unreadCount: studentUnreadCount
        });

        res.redirect("/admin/students?message=passkey_setup_allowed");

    } catch (err) {
        console.log("ADMIN ALLOW PASSKEY SETUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});


router.post("/students/:id/allow-trusted-device-setup", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const student = await Student.findOne(studentAccountQuery({
            _id: studentId,
            college: collegeId
        }));

        if (!student) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        student.trustedDeviceSetupAllowedAt = new Date();
        student.trustedDeviceSetupAllowedUntil = new Date(Date.now() + 30 * 60 * 1000);
        student.trustedDeviceSetupAllowedBy = req.user._id;

        await student.save();

        const studentNotification = await createNotification({
            college: collegeId,
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            title: "Browser fallback approved",
            message: "Your admin allowed trusted-browser fallback for 30 minutes. Use this only if your browser does not support passkeys.",
            category: "PASSKEY_SETUP",
            level: "success",
            link: "/student/passkeys",
            createdByType: "teacher",
            createdById: req.user._id
        });

        socketManager.emitNotification(studentNotification);

        const studentUnreadCount = await getUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "STUDENT",
            recipientUserId: student._id,
            unreadCount: studentUnreadCount
        });

        res.redirect("/admin/students?message=trusted_device_setup_allowed");

    } catch (err) {
        console.log("ADMIN ALLOW TRUSTED DEVICE SETUP ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});


router.post("/students/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const studentId = req.params.id;

        if (!isValidObjectId(studentId)) {
            return res.redirect("/admin/students?message=invalid_id");
        }

        const result = await deleteStudentRecord(collegeId, studentId);
        
        socketManager.emitStudentRejected(studentId, collegeId);

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ success: result.code === "deleted", message: result.code });
        }
        res.redirect("/admin/students?message=" + result.code);

    } catch (err) {
        console.log("ADMIN DELETE STUDENT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ success: false, error: "Server error" });
        }
        res.redirect("/admin/students?message=error");
    }
});

router.post("/students/delete-all", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const students = await Student.find(studentAccountQuery({
            college: collegeId
        })).select("_id");

        if (!students || students.length === 0) {
            return res.redirect("/admin/students?message=nothing_to_delete");
        }

        for (let i = 0; i < students.length; i++) {
            await deleteStudentRecord(collegeId, students[i]._id);
        }

        res.redirect("/admin/students?message=bulk_deleted");

    } catch (err) {
        console.log("ADMIN BULK DELETE STUDENT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});

/* ================= SCHEDULES ================= */

router.get("/schedules", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const schedules = await Schedule.find({
            college: collegeId
        })
        .populate("subject")
        .populate("teacher")
        .populate("classGroup")
        .populate("classroom");

        sortSchedulesByDayAndTime(schedules);

        const classGroups = await ClassGroup.find({
            college: collegeId,
            isActive: true
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const subjects = await Subject.find({
            college: collegeId,
            isActive: true
        })
        .populate("classGroup")
        .populate("teachers")
        .sort({
            subjectName: 1
        });

        const teachers = await Teacher.find(activeTeacherQuery({
            college: collegeId
        })).sort({
            fullName: 1
        });

        const classrooms = await Classroom.find({
            college: collegeId
        }).sort({
            classroomName: 1
        });

        const days = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        res.render("admin/schedules", {
            admin: req.user,
            schedules: schedules,
            classGroups: classGroups,
            subjects: subjects,
            teachers: teachers,
            classrooms: classrooms,
            days: days,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "schedules"
        });

    } catch (err) {
        console.log("ADMIN SCHEDULES ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Schedules error: "  + " Please try again.");
    }
});

router.post("/schedules/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classGroupId = req.body.classGroupId;
        const subjectId = req.body.subjectId;
        const teacherId = req.body.teacherId;
        const classroomId = req.body.classroomId;
        const day = cleanText(req.body.day);
        const startTime = cleanText(req.body.startTime);
        const endTime = cleanText(req.body.endTime);

        const validDays = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        if (
            !isValidObjectId(classGroupId) ||
            !isValidObjectId(subjectId) ||
            !isValidObjectId(teacherId) ||
            !isValidObjectId(classroomId) ||
            !validDays.includes(day)
        ) {
            return res.redirect("/admin/schedules?message=invalid_input");
        }

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (startMinutes === null || endMinutes === null) {
            return res.redirect("/admin/schedules?message=invalid_time");
        }

        if (endMinutes <= startMinutes) {
            return res.redirect("/admin/schedules?message=overnight_schedule_not_supported");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/schedules?message=invalid_class_group");
        }

        const classroom = await Classroom.findOne({
            _id: classroomId,
            college: collegeId,
            isDeleted: { $ne: true }
        });

        if (!classroom) {
            return res.redirect("/admin/schedules?message=invalid_classroom");
        }

        const teacher = await Teacher.findOne(activeTeacherQuery({
            _id: teacherId,
            college: collegeId
        }));

        if (!teacher) {
            return res.redirect("/admin/schedules?message=invalid_teacher");
        }

        const subject = await Subject.findOne({
            _id: subjectId,
            college: collegeId,
            classGroup: classGroupId,
            isActive: true
        });

        if (!subject) {
            return res.redirect("/admin/schedules?message=invalid_subject");
        }

        let teacherAssigned = false;

        for (let i = 0; i < subject.teachers.length; i++) {
            if (subject.teachers[i].toString() === teacherId.toString()) {
                teacherAssigned = true;
            }
        }

        if (!teacherAssigned) {
            return res.redirect("/admin/schedules?message=teacher_not_assigned");
        }

        const sameDaySchedules = await Schedule.find({
            college: collegeId,
            day: day
        });

        for (let i = 0; i < sameDaySchedules.length; i++) {
            const oldSchedule = sameDaySchedules[i];

            const oldStart = timeToMinutes(oldSchedule.startTime);
            const oldEnd = timeToMinutes(oldSchedule.endTime);

            if (oldStart === null || oldEnd === null) {
                continue;
            }

            const isOverlapping = startMinutes < oldEnd && endMinutes > oldStart;

            if (
                isOverlapping &&
                oldSchedule.teacher.toString() === teacherId.toString()
            ) {
                return res.redirect("/admin/schedules?message=teacher_clash");
            }

            if (
                isOverlapping &&
                oldSchedule.classGroup.toString() === classGroupId.toString()
            ) {
                return res.redirect("/admin/schedules?message=class_clash");
            }

            if (
                isOverlapping &&
                oldSchedule.classroom.toString() === classroomId.toString()
            ) {
                return res.redirect("/admin/schedules?message=room_clash");
            }
        }

        const createdSchedule = await Schedule.create({
            college: collegeId,
            classGroup: classGroupId,
            subject: subjectId,
            teacher: teacherId,
            classroom: classroomId,
            day: day,
            startTime: startTime,
            endTime: endTime
        });

        socketManager.emitScheduleChanged({
            reason: "created",
            collegeId: collegeId,
            classGroupId: classGroupId,
            teacherId: teacherId
        });

        await notifyTeacher(
            teacherId,
            collegeId,
            "New schedule assigned",
            (subject.subjectName || "Subject") +
                " scheduled for " +
                (classGroup.name || "your class") +
                " on " +
                day +
                " (" +
                startTime +
                " - " +
                endTime +
                ").",
            "SCHEDULE",
            "/teacher/dashboard",
            {
                scheduleId: createdSchedule._id.toString(),
                classGroupId: classGroupId.toString(),
                classroomId: classroomId.toString()
            }
        );

        setTimeout(async () => {
            try {
                const webpush = require("web-push");
                if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                    webpush.setVapidDetails(
                        process.env.VAPID_SUBJECT || "mailto:admin@attendify.com",
                        process.env.VAPID_PUBLIC_KEY,
                        process.env.VAPID_PRIVATE_KEY
                    );

                    const subjName = subject.subjectName || "a subject";
                    
                    // 1. Notify Students
                    const Student = require("../models/studentSchema");
                    const studentsToPush = await Student.find({
                        classGroup: classGroupId,
                        isDeleted: { $ne: true }
                    });
                    
                    const studentPayload = JSON.stringify({
                        title: "New Class Schedule Added",
                        body: `A new schedule for ${subjName} on ${day} has been added.`,
                        url: "/student/dashboard"
                    });
                    
                    studentsToPush.forEach(student => {
                        if (student.pushSubscriptions && student.pushSubscriptions.length > 0) {
                            student.pushSubscriptions.forEach(sub => {
                                webpush.sendNotification(sub, studentPayload).catch(() => {});
                            });
                        }
                    });

                    // 2. Notify Teacher
                    const teacher = await Teacher.findById(teacherId);
                    if (teacher && teacher.pushSubscriptions && teacher.pushSubscriptions.length > 0) {
                        const teacherPayload = JSON.stringify({
                            title: "New Schedule Assigned",
                            body: `You have been assigned to teach ${subjName} for ${classGroup.name} on ${day}.`,
                            url: "/teacher/dashboard"
                        });
                        teacher.pushSubscriptions.forEach(sub => {
                            webpush.sendNotification(sub, teacherPayload).catch(() => {});
                        });
                    }

                    // 3. Notify Admin (Creator)
                    const adminUser = await Teacher.findById(req.user._id);
                    if (adminUser && adminUser.pushSubscriptions && adminUser.pushSubscriptions.length > 0) {
                        const adminPayload = JSON.stringify({
                            title: "Schedule Created Successfully",
                            body: `You have successfully scheduled ${subjName} for ${classGroup.name}.`,
                            url: "/admin/schedules"
                        });
                        adminUser.pushSubscriptions.forEach(sub => {
                            webpush.sendNotification(sub, adminPayload).catch(() => {});
                        });
                    }
                }
            } catch (e) {
                console.log("Schedule Push trigger error", e);
            }
        }, 0);

        res.redirect("/admin/schedules?message=created");

    } catch (err) {
        console.log("ADMIN CREATE SCHEDULE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/schedules?message=error");
    }
});


router.get("/students/import-template", isCollegeAdmin, function (req, res) {
    const csvRows = [
        [
            "fullName",
            "email",
            "password",
            "enrollmentNumber",
            "department",
            "semester",
            "section"
        ],
        [
            "Harsh Koli",
            "harsh@gmail.com",
            "harsh123",
            "22AIML001",
            "AIML",
            "4",
            "A"
        ],
        [
            "Rahul Sharma",
            "rahul@gmail.com",
            "rahul123",
            "22AIML002",
            "AIML",
            "4",
            "A"
        ]
    ];

    const csvContent = csvRows.map(function (row) {
        return row.map(csvEscape).join(",");
    }).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=students-import-format.csv"
    );

    res.send(csvContent);
});

router.get("/students/export", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const students = await Student.find(studentAccountQuery({
            college: collegeId
        }))
            .populate("classGroup")
            .sort({
                department: 1,
                semester: 1,
                enrollmentNumber: 1
            });

        const csvRows = [];

        csvRows.push([
            "fullName",
            "email",
            "enrollmentNumber",
            "department",
            "semester",
            "section",
            "classGroupName",
            "isBlocked",
            "createdAt"
        ]);

        students.forEach(function (student) {
            csvRows.push([
                student.fullName,
                student.email,
                student.enrollmentNumber,
                student.department,
                student.semester,
                student.classGroup ? student.classGroup.section : "",
                student.classGroup ? student.classGroup.name : "",
                student.isBlocked ? "YES" : "NO",
                student.createdAt ? student.createdAt.toISOString() : ""
            ]);
        });

        const csvContent = csvRows.map(function (row) {
            return row.map(csvEscape).join(",");
        }).join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            "attachment; filename=students-export.csv"
        );

        res.send(csvContent);

    } catch (err) {
        console.log("ADMIN EXPORT STUDENTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/students?message=error");
    }
});

router.post(
    "/students/import",
    isCollegeAdmin,
    uploadStudentsCsv.single("studentsCsv"),
    async function (req, res) {
        try {
            const collegeId = getCollegeId(req);

            if (!req.file) {
                setStudentImportResult(req, {
                    type: "error",
                    title: "Import Failed",
                    message: "Please upload a CSV file.",
                    errors: []
                });

                return res.redirect("/admin/students");
            }

            const csvText = req.file.buffer.toString("utf8");
            const parsedCsv = parseStudentsCsv(csvText);

            if (parsedCsv.errors.length > 0) {
                setStudentImportResult(req, {
                    type: "error",
                    title: "Invalid CSV Format",
                    message: "Please fix the CSV header.",
                    errors: parsedCsv.errors
                });

                return res.redirect("/admin/students");
            }

            const rows = parsedCsv.rows;
            const validationErrors = [];

            const emailSet = new Set();
            const enrollmentSet = new Set();

            const preparedStudents = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];

                const fullName = csvCleanText(row.fullName);
                const email = csvCleanEmail(row.email);
                const password = csvCleanText(row.password);
                const enrollmentNumber = csvCleanUpper(row.enrollmentNumber);
                const department = csvCleanUpper(row.department);
                const semester = Number(row.semester);
                const section = csvCleanUpper(row.section);

                if (!fullName) {
                    validationErrors.push("Row " + row.rowNumber + ": Full name is required.");
                }

                if (!email || !csvIsValidEmail(email)) {
                    validationErrors.push("Row " + row.rowNumber + ": Valid email is required.");
                }

                if (!password || password.length < 6) {
                    validationErrors.push("Row " + row.rowNumber + ": Password must be at least 6 characters.");
                }

                if (!enrollmentNumber) {
                    validationErrors.push("Row " + row.rowNumber + ": Enrollment number is required.");
                }

                if (!department) {
                    validationErrors.push("Row " + row.rowNumber + ": Department is required.");
                }

                if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
                    validationErrors.push("Row " + row.rowNumber + ": Semester must be between 1 and 12.");
                }

                if (!section) {
                    validationErrors.push("Row " + row.rowNumber + ": Section is required.");
                }

                if (emailSet.has(email)) {
                    validationErrors.push("Row " + row.rowNumber + ": Duplicate email inside CSV.");
                }

                if (enrollmentSet.has(enrollmentNumber)) {
                    validationErrors.push("Row " + row.rowNumber + ": Duplicate enrollment number inside CSV.");
                }

                emailSet.add(email);
                enrollmentSet.add(enrollmentNumber);

                const classGroup = await ClassGroup.findOne({
                    college: collegeId,
                    department: department,
                    semester: semester,
                    section: section,
                    isActive: true
                });

                if (!classGroup) {
                    validationErrors.push(
                        "Row " +
                        row.rowNumber +
                        ": Class Group not found for " +
                        department +
                        " Sem " +
                        semester +
                        " Section " +
                        section +
                        ". Create this class group first."
                    );
                }

                preparedStudents.push({
                    rowNumber: row.rowNumber,
                    fullName: fullName,
                    email: email,
                    password: password,
                    enrollmentNumber: enrollmentNumber,
                    department: department,
                    semester: semester,
                    section: section,
                    classGroup: classGroup
                });
            }

            const emails = Array.from(emailSet);
            const enrollments = Array.from(enrollmentSet);

            const existingStudentsByEmail = await Student.find({
                email: {
                    $in: emails
                }
            });

            if (existingStudentsByEmail.length > 0) {
                existingStudentsByEmail.forEach(function (student) {
                    validationErrors.push(
                        "Email already exists: " + student.email
                    );
                });
            }

            const existingStudentsByEnrollment = await Student.find({
                college: collegeId,
                enrollmentNumber: {
                    $in: enrollments
                }
            });

            if (existingStudentsByEnrollment.length > 0) {
                existingStudentsByEnrollment.forEach(function (student) {
                    validationErrors.push(
                        "Enrollment number already exists: " + student.enrollmentNumber
                    );
                });
            }

            const existingTeachersByEmail = await Teacher.find({
                email: {
                    $in: emails
                }
            });

            if (existingTeachersByEmail.length > 0) {
                existingTeachersByEmail.forEach(function (teacher) {
                    validationErrors.push(
                        "Email already used by teacher/admin: " + teacher.email
                    );
                });
            }

            if (validationErrors.length > 0) {
                setStudentImportResult(req, {
                    type: "error",
                    title: "Import Failed",
                    message: "No students were imported. Fix these errors and upload again.",
                    errors: validationErrors.slice(0, 50)
                });

                return res.redirect("/admin/students");
            }

            let importedCount = 0;

            for (let i = 0; i < preparedStudents.length; i++) {
                const item = preparedStudents[i];

                const subjectsInGroup = await Subject.find({
                    college: collegeId,
                    classGroup: item.classGroup._id,
                    isActive: true
                });

                const subjectIds = subjectsInGroup.map(function (subject) {
                    return subject._id;
                });

                const student = await Student.create({
                    fullName: item.fullName,
                    email: item.email,
                    password: item.password,
                    enrollmentNumber: item.enrollmentNumber,
                    department: item.department,
                    semester: item.semester,
                    college: collegeId,
                    classGroup: item.classGroup._id,
                    subjects: subjectIds
                });

                await ClassGroup.updateOne(
                    {
                        _id: item.classGroup._id,
                        college: collegeId
                    },
                    {
                        $addToSet: {
                            students: student._id
                        }
                    }
                );

                await Subject.updateMany(
                    {
                        _id: {
                            $in: subjectIds
                        },
                        college: collegeId
                    },
                    {
                        $addToSet: {
                            students: student._id
                        }
                    }
                );

                importedCount++;
            }

            setStudentImportResult(req, {
                type: "success",
                title: "Import Successful",
                message: importedCount + " students imported successfully.",
                errors: []
            });

            res.redirect("/admin/students");

        } catch (err) {
            console.log("ADMIN IMPORT STUDENTS ERROR:");
            console.log(err.message);
            console.log(err.stack);

            setStudentImportResult(req, {
                type: "error",
                title: "Import Failed",
                message: "Import error: "  + " Please try again.",
                errors: []
            });

            res.redirect("/admin/students");
        }
    }
);

router.post("/schedules/:id/update", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const scheduleId = req.params.id;

        if (!isValidObjectId(scheduleId)) {
            return res.redirect("/admin/schedules?message=invalid_id");
        }

        const day = cleanText(req.body.day);
        const startTime = cleanText(req.body.startTime);
        const endTime = cleanText(req.body.endTime);
        const classGroupId = req.body.classGroupId;
        const subjectId = req.body.subjectId;
        const teacherId = req.body.teacherId;
        const classroomId = req.body.classroomId;

        const validDays = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday"
        ];

        if (
            !validDays.includes(day) ||
            !startTime ||
            !endTime ||
            !isValidObjectId(classGroupId) ||
            !isValidObjectId(subjectId) ||
            !isValidObjectId(teacherId) ||
            !isValidObjectId(classroomId)
        ) {
            return res.redirect("/admin/schedules?message=invalid_input");
        }

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (startMinutes === null || endMinutes === null) {
            return res.redirect("/admin/schedules?message=invalid_time");
        }

        if (endMinutes <= startMinutes) {
            return res.redirect("/admin/schedules?message=overnight_schedule_not_supported");
        }

        const schedule = await Schedule.findOne({
            _id: scheduleId,
            college: collegeId
        });

        if (!schedule) {
            return res.redirect("/admin/schedules?message=invalid_schedule");
        }

        const activeAttendanceExists = await AttendanceSession.exists({
            college: collegeId,
            schedule: scheduleId,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: new Date() }
        });

        if (activeAttendanceExists) {
            return res.redirect("/admin/schedules?message=active_schedule_session");
        }

        const attendanceExists = await AttendanceSession.exists({
            college: collegeId,
            schedule: scheduleId
        });

        const changingClassGroup =
            schedule.classGroup.toString() !== classGroupId.toString();

        const changingSubject =
            schedule.subject.toString() !== subjectId.toString();

        const changingTeacher =
            schedule.teacher.toString() !== teacherId.toString();

        const changingClassroom =
            schedule.classroom.toString() !== classroomId.toString();

        if (
            attendanceExists &&
            (
                changingClassGroup ||
                changingSubject ||
                changingTeacher ||
                changingClassroom
            )
        ) {
            return res.redirect("/admin/schedules?message=schedule_locked_fields");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: collegeId,
            isActive: true
        });

        if (!classGroup) {
            return res.redirect("/admin/schedules?message=invalid_class_group");
        }

        const subject = await Subject.findOne({
            _id: subjectId,
            college: collegeId,
            isActive: true
        }).populate("teachers");

        if (!subject) {
            return res.redirect("/admin/schedules?message=invalid_subject");
        }

        const subjectClassGroupId = subject.classGroup
            ? subject.classGroup.toString()
            : "";

        if (subjectClassGroupId !== classGroupId.toString()) {
            return res.redirect("/admin/schedules?message=invalid_subject_class");
        }

        const teacher = await Teacher.findOne(activeTeacherQuery({
            _id: teacherId,
            college: collegeId
        }));

        if (!teacher) {
            return res.redirect("/admin/schedules?message=invalid_teacher");
        }

        const teacherAssignedToSubject = subject.teachers.some(function (subjectTeacher) {
            return subjectTeacher._id.toString() === teacherId.toString();
        });

        if (!teacherAssignedToSubject) {
            return res.redirect("/admin/schedules?message=teacher_not_assigned");
        }

        const classroom = await Classroom.findOne({
            _id: classroomId,
            college: collegeId
        });

        if (!classroom) {
            return res.redirect("/admin/schedules?message=invalid_classroom");
        }

        const possibleConflicts = await Schedule.find({
            _id: { $ne: scheduleId },
            college: collegeId,
            day: day,
            $or: [
                { teacher: teacherId },
                { classGroup: classGroupId },
                { classroom: classroomId }
            ]
        });

        for (let i = 0; i < possibleConflicts.length; i++) {
            const existingSchedule = possibleConflicts[i];

            const existingStartMinutes = timeToMinutes(existingSchedule.startTime);
            const existingEndMinutes = timeToMinutes(existingSchedule.endTime);

            const isOverlapping =
                startMinutes < existingEndMinutes &&
                existingStartMinutes < endMinutes;

            if (isOverlapping) {
                const sameTeacher =
                    existingSchedule.teacher.toString() === teacherId.toString();
                const sameClassGroup =
                    existingSchedule.classGroup.toString() === classGroupId.toString();
                const sameClassroom =
                    existingSchedule.classroom.toString() === classroomId.toString();
                const sameSubject =
                    existingSchedule.subject &&
                    existingSchedule.subject.toString() === subjectId.toString();

                /*
                    Sometimes duplicate schedule rows exist for the exact same class,
                    subject, teacher and classroom. Editing one of them should not
                    fail as a false "teacher conflict".
                */
                if (sameTeacher && sameClassGroup && sameClassroom && sameSubject) {
                    continue;
                }

                if (existingSchedule.teacher.toString() === teacherId.toString()) {
                    return res.redirect("/admin/schedules?message=teacher_conflict");
                }

                if (existingSchedule.classGroup.toString() === classGroupId.toString()) {
                    return res.redirect("/admin/schedules?message=class_conflict");
                }

                if (existingSchedule.classroom.toString() === classroomId.toString()) {
                    return res.redirect("/admin/schedules?message=classroom_conflict");
                }
            }
        }

        schedule.day = day;
        schedule.startTime = startTime;
        schedule.endTime = endTime;
        schedule.classGroup = classGroupId;
        schedule.subject = subjectId;
        schedule.teacher = teacherId;
        schedule.classroom = classroomId;

        await schedule.save();

        // Check if we need to reopen any sessions for today due to extension
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const sessionsToUpdate = await AttendanceSession.find({
            schedule: schedule._id,
            startTime: { $gte: today, $lt: tomorrow }
        });

        for (let i = 0; i < sessionsToUpdate.length; i++) {
            const sess = sessionsToUpdate[i];
            const windowInfo = attendanceWindow.isAttendanceWindowOpen(sess, schedule);
            if (windowInfo.isOpen) {
                sess.isActive = true;
                sess.status = "ACTIVE";
                sess.wasReopenedAfterExtension = true;
                
                if (windowInfo.effectiveEnd) {
                    sess.effectiveEndTime = windowInfo.effectiveEnd;
                    sess.endTime = windowInfo.effectiveEnd;
                }
                
                await sess.save();

                // Unlock AUTO_ABSENT records
                await AttendanceRecord.updateMany(
                    {
                        attendanceSession: sess._id,
                        absenceType: "AUTO_ABSENT"
                    },
                    {
                        $set: {
                            isFinalLocked: false,
                            wasReopenedAfterExtension: true
                        }
                    }
                );
                
                // Let live clients know session is active again
                socketManager.emitAttendanceStarted(sess);
            }
        }

        socketManager.emitScheduleChanged({
            reason: "updated",
            scheduleId: schedule._id,
            collegeId: collegeId,
            classGroupId: schedule.classGroup,
            teacherId: schedule.teacher
        });

        await notifyTeacher(
            teacherId,
            collegeId,
            "Schedule updated",
            (subject.subjectName || "Subject") +
                " schedule updated: " +
                day +
                " (" +
                startTime +
                " - " +
                endTime +
                ").",
            "SCHEDULE",
            "/teacher/dashboard",
            {
                scheduleId: schedule._id.toString(),
                classGroupId: classGroupId.toString(),
                classroomId: classroomId.toString()
            }
        );

        setTimeout(async () => {
            try {
                const webpush = require("web-push");
                if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                    webpush.setVapidDetails(
                        process.env.VAPID_SUBJECT || "mailto:admin@attendify.com",
                        process.env.VAPID_PUBLIC_KEY,
                        process.env.VAPID_PRIVATE_KEY
                    );

                    const subjName = subject.subjectName || "a subject";
                    const className = classGroup ? classGroup.name : "your class";
                    
                    // 1. Notify Students
                    const Student = require("../models/studentSchema");
                    const studentsToPush = await Student.find({
                        classGroup: classGroupId,
                        isDeleted: { $ne: true }
                    });
                    
                    const studentPayload = JSON.stringify({
                        title: "Class Rescheduled",
                        body: `The schedule for ${subjName} has been updated to ${day} (${startTime} - ${endTime}).`,
                        url: "/student/dashboard"
                    });
                    
                    studentsToPush.forEach(student => {
                        if (student.pushSubscriptions && student.pushSubscriptions.length > 0) {
                            student.pushSubscriptions.forEach(sub => {
                                webpush.sendNotification(sub, studentPayload).catch(() => {});
                            });
                        }
                    });

                    // 2. Notify Teacher
                    const teacher = await Teacher.findById(teacherId);
                    if (teacher && teacher.pushSubscriptions && teacher.pushSubscriptions.length > 0) {
                        const teacherPayload = JSON.stringify({
                            title: "Schedule Updated",
                            body: `Your schedule for ${subjName} (${className}) has been changed to ${day} (${startTime} - ${endTime}).`,
                            url: "/teacher/dashboard"
                        });
                        teacher.pushSubscriptions.forEach(sub => {
                            webpush.sendNotification(sub, teacherPayload).catch(() => {});
                        });
                    }

                    // 3. Notify Admin (Creator)
                    const adminUser = await Teacher.findById(req.user._id);
                    if (adminUser && adminUser.pushSubscriptions && adminUser.pushSubscriptions.length > 0) {
                        const adminPayload = JSON.stringify({
                            title: "Schedule Updated Successfully",
                            body: `You have successfully rescheduled ${subjName} for ${className}.`,
                            url: "/admin/schedules"
                        });
                        adminUser.pushSubscriptions.forEach(sub => {
                            webpush.sendNotification(sub, adminPayload).catch(() => {});
                        });
                    }
                }
            } catch (e) {
                console.log("Schedule Update Push trigger error", e);
            }
        }, 0);

        res.redirect("/admin/schedules?message=updated");

    } catch (err) {
        console.log("ADMIN UPDATE SCHEDULE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/schedules?message=error");
    }
});

router.post("/schedules/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const scheduleId = req.params.id;

        if (!isValidObjectId(scheduleId)) {
            return res.redirect("/admin/schedules?message=invalid_id");
        }

        const schedule = await Schedule.findOne({
            _id: scheduleId,
            college: collegeId
        });

        if (!schedule) {
            return res.redirect("/admin/schedules?message=invalid_id");
        }

        const hasActiveAttendanceSession = await AttendanceSession.exists({
            college: collegeId,
            schedule: scheduleId,
            isActive: true,
            status: "ACTIVE"
        });

        if (hasActiveAttendanceSession) {
            return res.redirect("/admin/schedules?message=active_schedule_session");
        }

        await AttendanceSession.updateMany(
            {
                college: collegeId,
                schedule: scheduleId
            },
            {
                $unset: { schedule: "" }
            }
        );

        await AttendanceAttempt.updateMany(
            {
                college: collegeId,
                schedule: scheduleId
            },
            {
                $unset: { schedule: "" }
            }
        );

        await Schedule.deleteOne({
            _id: scheduleId,
            college: collegeId
        });

        socketManager.emitScheduleChanged({
            reason: "deleted",
            scheduleId: schedule._id,
            collegeId: collegeId,
            classGroupId: schedule.classGroup,
            teacherId: schedule.teacher
        });

        await notifyTeacher(
            schedule.teacher,
            collegeId,
            "Schedule removed",
            "One of your class schedules was removed by admin.",
            "SCHEDULE",
            "/teacher/dashboard",
            {
                scheduleId: schedule._id.toString(),
                classGroupId: schedule.classGroup ? schedule.classGroup.toString() : ""
            }
        );

        res.redirect("/admin/schedules?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE SCHEDULE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/admin/schedules?message=error");
    }
});

// ── REALTIME POLLING FALLBACK ────────────────────────────────────────────────
router.get("/realtime/poll", isCollegeAdmin, async function (req, res) {
    try {
        const adminId = req.user._id || req.user.id;
        const collegeId = req.user.college;

        const { getUnreadCount } = require("../utils/notificationService");
        const unreadCount = await getUnreadCount({ recipientRole: "ADMIN", recipientUserId: adminId, college: collegeId });

        const since = Number(req.query.since) || 0;
        let needsReload = false;

        if (since > 0) {
            const AttendanceSession = require("../models/attendanceSessionSchema");
            const majorChanges = await AttendanceSession.countDocuments({
                college: collegeId,
                $or: [
                    { startTime: { $gt: new Date(since) } },
                    { closedAt: { $gt: new Date(since) } },
                    { absentsMarkedAt: { $gt: new Date(since) } }
                ]
            });
            if (majorChanges > 0) needsReload = true;
            else {
                const AttendanceRecord = require("../models/attendanceRecordSchema");
                const newRecords = await AttendanceRecord.countDocuments({
                    college: collegeId,
                    createdAt: { $gt: new Date(since) }
                });
                if (newRecords > 0) needsReload = true;
            }
        }

        res.json({
            success: true,
            serverTimestamp: Date.now(),
            unreadNotificationCount: unreadCount,
            needsReload: needsReload
        });
    } catch (err) {
        res.json({ success: false });
    }
});

module.exports = router;
