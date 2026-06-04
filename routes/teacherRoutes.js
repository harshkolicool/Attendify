const socketManager = require("../utils/socketManager");
const realtimeConfig = require("../utils/realtimeConfig");
const express = require("express");
const {
    MAX_GPS_ACCURACY_METERS,
    isUsableAccuracy,
    isValidCoordinate,
    logGpsDecision
} = require("../utils/locationVerification");
const router = express.Router();

const Schedule = require("../models/scheduleSchema");
const Teacher = require("../models/teacherSchema");
const Student = require("../models/studentSchema");
const Classroom = require("../models/classroomSchema");
const ClassGroup = require("../models/classGroupSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const AttendanceAttempt = require("../models/attendanceAttemptSchema");
const Subject = require("../models/subjectSchema");
const {
    getUnreadCount,
    getRecentNotifications,
    markAllRead,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications
} = require("../utils/notificationService");
const {
    finalizeAbsencesForSession
} = require("../utils/attendanceExpiryJob");

const {
    timeToMinutes,
    getScheduleTimeStatus,
    getTodayName,
    getTodayRange,
    sortSchedulesByTime
} = require("../utils/scheduleTime");

function teacherGetDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}

function teacherGetStartOfDate(dateString) {
    if (dateString) {
        return new Date(dateString + "T00:00:00.000+05:30");
    }
    return getTodayRange().start;
}

function teacherGetEndOfDate(dateString) {
    if (dateString) {
        return new Date(dateString + "T23:59:59.999+05:30");
    }
    return getTodayRange().end;
}

function teacherGetDayNameFromDate(date) {
    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];

    return days[date.getDay()];
}

function teacherNormalizeManualDateInput(dateInput) {
    const todayInput = teacherGetDateInputValue(new Date());

    if (!dateInput || !dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return todayInput;
    }

    const parsed = new Date(dateInput + "T00:00:00");

    if (Number.isNaN(parsed.getTime())) {
        return todayInput;
    }

    const todayStart = teacherGetStartOfDate(todayInput);

    if (parsed.getTime() > todayStart.getTime()) {
        return todayInput;
    }

    return teacherGetDateInputValue(parsed);
}

function teacherGetManualDateLabel(dateInput) {
    const date = new Date(dateInput + "T00:00:00");

    return date.toLocaleDateString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function teacherGetPercent(part, total) {
    if (!total || total <= 0) {
        return 0;
    }

    return Math.round((part / total) * 100);
}

function teacherIsPositiveAttendanceStatus(status) {
    return status === "PRESENT" || status === "LATE" || status === "EXCUSED";
}

function teacherSafeObjectId(value) {
    if (!value || value === "all") {
        return null;
    }

    if (!value.match(/^[0-9a-fA-F]{24}$/)) {
        return null;
    }

    return value;
}

function getTeacherNotificationFilter(teacher) {
    return {
        recipientRole: "TEACHER",
        recipientUserId: teacher._id || teacher.id
    };
}

// isValidGpsAccuracy and isValidLatitude/Longitude are now handled by locationVerification.js
// so we don't need these standalone functions here anymore.

function isTeacher(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect("/teacher/login");
    }

    if (req.user.accountType !== "teacher") {
        return res.redirect("/");
    }

    if (req.user.isBlocked) {
        req.logout(function () {
            return res.redirect("/teacher/login?error=blocked");
        });
        return;
    }

    next();
}

// getTodayName is imported from utils/scheduleTime.js

function getErrorMessage(errorCode) {
        
    if (errorCode === "location") {
        return "Teacher location is required to start attendance. Please allow location access.";
    }

    if (errorCode === "invalid_teacher_location") {
        return "Teacher GPS location is invalid. Please try again.";
    }

    if (errorCode === "teacher_location_accuracy_low") {
        return "Teacher GPS accuracy is too low. Move near a window or open area and try again.";
    }

    if (errorCode === "outside_window") {
        return "You can only start attendance during the scheduled class time.";
    }

    if (errorCode === "class_not_ended") {
        return "Manual attendance is only available after the class time has ended.";
    }

    if (errorCode === "session_exists") {
        return "Attendance was already started for this class today.";
    }

    if (errorCode === "manual_done") {
        return "Attendance was already recorded for this class today.";
    }

    if (errorCode === "schedule_missing") {
        return "Schedule not found. Please start attendance from a valid schedule card.";
    }

    if (errorCode === "active_session_exists") {
        return "This class already has an active attendance session.";
    }

    if (errorCode === "manual_page_only") {
        return "Class time is over. Please use the manual attendance page.";
    }
    
    if (errorCode === "no_students") {
        return "No students found in this class group.";
    }

    return null;
}

function getSuccessMessage(messageCode) {
    if (messageCode === "live_started") {
        return "Attendance started successfully.";
    }

    if (messageCode === "manual_saved") {
        return "Manual attendance saved successfully.";
    }
    if (messageCode === "live_restarted") {
        return "Attendance session restarted successfully.";
    }

    return null;
}

function sameId(a, b) {
    if (!a || !b) {
        return false;
    }

    const first = a._id ? a._id.toString() : a.toString();
    const second = b._id ? b._id.toString() : b.toString();

    return first === second;
}

function findSessionForSchedule(sessions, schedule) {
    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];

        if (session.schedule && sameId(session.schedule, schedule._id)) {
            return session;
        }
    }

    return null;
}

const { escapeCsvValue } = require("../utils/csv");

function teacherCsvEscape(value) {
    return escapeCsvValue(value);
}

function teacherSendCsvResponse(res, filename, rows) {
    const csvContent = rows.map(function (row) {
        return row.map(teacherCsvEscape).join(",");
    }).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
        "Content-Disposition",
        "attachment; filename=" + filename
    );

    res.send(csvContent);
}

function mapTeacherLiveDevice(device, sessionId) {
    if (!device || !device.student) {
        return null;
    }

    const studentId = device.student._id
        ? device.student._id.toString()
        : device.student.toString();

    if (!studentId) {
        return null;
    }

    return {
        sessionId: sessionId.toString(),
        studentId: studentId,
        studentName: device.studentName || "Student",
        enrollmentNumber: device.enrollmentNumber || "",
        deviceId: device.deviceId || "default",
        deviceLabel: device.deviceLabel || "Device",
        latitude: Number(device.latitude),
        longitude: Number(device.longitude),
        accuracy:
            device.accuracy === null || device.accuracy === undefined
                ? null
                : Number(device.accuracy),
        distance: Number(device.distance || 0),
        configuredRadius: Number(device.configuredRadius || 0),
        effectiveRadius: Number(device.effectiveRadius || 0),
        uncertaintyAllowance: Number(device.uncertaintyAllowance || 0),
        inside: Boolean(device.inside),
        status: device.status || "UNKNOWN",
        reasonCode: device.reasonCode || "",
        updatedAt: device.lastActiveAt || new Date(),
        online: device.online !== false
    };
}

async function getScheduleForTeacher(req) {
    const scheduleId = req.body.scheduleId;

    if (!scheduleId) {
        return null;
    }

    const today = getTodayName();

    const scheduleItem = await Schedule.findOne({
        _id: scheduleId,
        teacher: req.user._id,
        college: req.user.college,
        day: today
    })
    .populate("subject")
    .populate("classGroup")
    .populate("classroom");

    return scheduleItem;
}

function getScheduleDateTimeForToday(timeText) {
    const minutes = timeToMinutes(timeText);

    if (minutes === null) {
        return null;
    }

    const date = getTodayRange().start;
    return new Date(date.getTime() + (minutes * 60000));
}

function isScheduleAlreadyManuallyRecorded(session) {
    if (!session) {
        return false;
    }

    if (!session.attendanceRecords || session.attendanceRecords.length === 0) {
        return false;
    }

    if (session.status === "CLOSED" && session.isActive === false) {
        return true;
    }

    return false;
}

async function getLatestTodaySessionForSchedule(scheduleItem, teacherId, collegeId) {
    const todayRange = getTodayRange();

    return AttendanceSession.findOne({
        schedule: scheduleItem._id,
        teacher: teacherId,
        college: collegeId,
        startTime: {
            $gte: todayRange.start,
            $lte: todayRange.end
        }
    })
    .sort({
        createdAt: -1
    });
}

async function getLatestSessionForScheduleByDate(
    scheduleItem,
    teacherId,
    collegeId,
    dateInput
) {
    const rangeStart = teacherGetStartOfDate(dateInput);
    const rangeEnd = teacherGetEndOfDate(dateInput);

    return AttendanceSession.findOne({
        schedule: scheduleItem._id,
        teacher: teacherId,
        college: collegeId,
        startTime: {
            $gte: rangeStart,
            $lte: rangeEnd
        }
    })
    .sort({
        createdAt: -1
    });
}

router.get("/dashboard", isTeacher, async (req, res) => {
    try {
        const today = getTodayName();
        const now = new Date();
        const todayRange = getTodayRange();

        const teacher = await Teacher.findById(req.user._id)
            .populate("subjects");

        if (!teacher) {
            return res.send("Teacher not found");
        }

        const schedules = await Schedule.find({
            teacher: req.user._id,
            college: req.user.college,
            day: today
        })
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        sortSchedulesByTime(schedules);

        const classGroups = await ClassGroup.find({
            college: req.user.college,
            isActive: true
        });

        const classrooms = await Classroom.find({
            college: req.user.college
        });

        const activeSessions = await AttendanceSession.find({
            teacher: req.user._id,
            college: req.user.college,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: now }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        const todaysSessions = await AttendanceSession.find({
            teacher: req.user._id,
            college: req.user.college,
            startTime: {
                $gte: todayRange.start,
                $lte: todayRange.end
            }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        const classGroupIds = [];

        for (let i = 0; i < schedules.length; i++) {
            if (schedules[i].classGroup) {
                classGroupIds.push(schedules[i].classGroup._id);
            }
        }

        const students = await Student.find({
            college: req.user.college,
            classGroup: { $in: classGroupIds },
            isDeleted: { $ne: true }
        }).sort({ fullName: 1 });

        const studentsByClassGroup = {};

        for (let i = 0; i < students.length; i++) {
            const groupId = students[i].classGroup.toString();

            if (!studentsByClassGroup[groupId]) {
                studentsByClassGroup[groupId] = [];
            }

            studentsByClassGroup[groupId].push(students[i]);
        }

        const scheduleCards = [];
        const manualAttendanceList = [];

        for (let i = 0; i < schedules.length; i++) {
            const item = schedules[i];

            let timeStatus = "invalid";
            let todaySession = null;
            let liveSession = null;

            if (item.subject && item.classGroup && item.classroom) {
                timeStatus = getScheduleTimeStatus(
                    item.startTime,
                    item.endTime,
                    now
                );

                todaySession = findSessionForSchedule(todaysSessions, item);
                liveSession = findSessionForSchedule(activeSessions, item);
            }

            const card = {
                schedule: item,
                timeStatus: timeStatus,
                todaySession: todaySession,
                liveSession: liveSession,
                canStart: false,
                canRestart: false,
                showManual: false,
                manualAlreadyDone: false
            };

            /*
                FIX:
                Earlier logic blocked start if ANY todaySession existed.
                Now teacher can start/restart if:
                - current time is within class time
                - no active session exists
                - schedule data is valid
            */
            if (
                timeStatus === "live" &&
                !liveSession &&
                item.subject &&
                item.classGroup &&
                item.classroom
            ) {
                card.canStart = true;

                if (todaySession) {
                    card.canRestart = true;
                }
            }

            /*
                Manual attendance:
                available only after class time ended.
                If a completed session already exists, show Recorded.
            */
            if (
                timeStatus === "ended" &&
                item.subject &&
                item.classGroup &&
                item.classroom
            ) {
                if (todaySession && isScheduleAlreadyManuallyRecorded(todaySession)) {
                    card.manualAlreadyDone = true;
                } else if (!todaySession) {
                    card.showManual = true;

                    const groupId = item.classGroup._id.toString();
                    const classStudents = studentsByClassGroup[groupId] || [];

                    manualAttendanceList.push({
                        schedule: item,
                        students: classStudents
                    });
                }
            }

            scheduleCards.push(card);
        }

        res.render("teacherDashboard", {
            teacher: teacher,
            activePage: "dashboard",
            subjects: teacher.subjects || [],
            classGroups: classGroups || [],
            classrooms: classrooms || [],
            activeSessions: activeSessions || [],
            schedules: schedules || [],
            scheduleCards: scheduleCards || [],
            manualAttendanceList: manualAttendanceList || [],
            today: today,
            realtimeMode: realtimeConfig.getRealtimeMode(),
            realtimePollIntervalMs: realtimeConfig.getPollIntervalMs(),
            message: getSuccessMessage(req.query.message),
            error: getErrorMessage(req.query.error),
            vapidPublicKey: process.env.VAPID_PUBLIC_KEY
        });

    } catch (err) {
        console.log("TEACHER DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});

router.get("/notifications", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("-password");

        if (!teacher) {
            return res.redirect("/teacher/login");
        }

        const notifications = await getRecentNotifications(
            getTeacherNotificationFilter(teacher),
            120
        );

        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(teacher));

        res.render("teacherNotifications", {
            teacher: teacher,
            activePage: "notifications",
            notifications: notifications,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.log("TEACHER NOTIFICATIONS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Teacher notifications error: " + "An internal server error occurred.");
    }
});

router.post("/notifications/mark-all-read", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("_id");

        if (!teacher) {
            return res.redirect("/teacher/login");
        }

        await markAllRead(getTeacherNotificationFilter(teacher));

        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(teacher));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "TEACHER",
            recipientUserId: teacher._id,
            unreadCount: unreadCount
        });

        res.redirect("/teacher/notifications");
    } catch (err) {
        console.log("TEACHER MARK ALL NOTIFICATIONS READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/notifications");
    }
});

router.post("/notifications/clear-all", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("_id");

        if (!teacher) {
            return res.redirect("/teacher/login");
        }

        await clearAllNotifications(getTeacherNotificationFilter(teacher));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "TEACHER",
            recipientUserId: teacher._id,
            unreadCount: 0
        });

        res.redirect("/teacher/notifications");
    } catch (err) {
        console.log("TEACHER CLEAR ALL NOTIFICATIONS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/notifications");
    }
});

router.post("/notifications/:id/read", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("_id");

        if (!teacher) {
            return res.redirect("/teacher/login");
        }

        await markNotificationRead(req.params.id, getTeacherNotificationFilter(teacher));

        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(teacher));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "TEACHER",
            recipientUserId: teacher._id,
            unreadCount: unreadCount
        });

        res.redirect("/teacher/notifications");
    } catch (err) {
        console.log("TEACHER MARK NOTIFICATION READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/notifications");
    }
});

router.post("/notifications/:id/delete", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("_id");

        if (!teacher) {
            return res.redirect("/teacher/login");
        }

        await deleteNotification(req.params.id, getTeacherNotificationFilter(teacher));

        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(teacher));

        socketManager.emitNotificationUnreadCount({
            recipientRole: "TEACHER",
            recipientUserId: teacher._id,
            unreadCount: unreadCount
        });

        res.redirect("/teacher/notifications");
    } catch (err) {
        console.log("TEACHER DELETE NOTIFICATION ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/notifications");
    }
});

router.get("/notifications/unread-count", isTeacher, async function (req, res) {
    try {
        const teacher = await Teacher.findById(req.user._id).select("_id");

        if (!teacher) {
            return res.status(401).json({
                success: false,
                message: "Teacher not found."
            });
        }

        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(teacher));

        res.json({
            success: true,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.log("TEACHER UNREAD NOTIFICATION COUNT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Unable to load unread notification count."
        });
    }
});

router.get("/suspicious-attempts/recent", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const attempts = await AttendanceAttempt.find({
            teacher: teacherId,
            result: { $ne: "SUCCESS" },
            createdAt: { $gte: todayStart }
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            attempts: attempts.map(function (attempt) {
                return {
                    attemptId: attempt._id.toString(),
                    sessionId: attempt.attendanceSession ? attempt.attendanceSession.toString() : "",
                    scheduleId: attempt.schedule ? attempt.schedule.toString() : "",
                    studentId: attempt.student ? attempt.student.toString() : "",
                    studentName: attempt.studentName || "Unknown Student",
                    enrollmentNumber: attempt.enrollmentNumber || "Unknown",
                    reasonCode: attempt.reasonCode || "UNKNOWN",
                    reasonMessage: attempt.reasonMessage || "Suspicious attendance attempt.",
                    result: attempt.result || "REJECTED",
                    distanceFromTeacher: Math.round(attempt.distanceFromTeacher || 0),
                    allowedRadius: Math.round(attempt.allowedRadius || 0),
                    gpsAccuracy: Math.round(attempt.gpsAccuracy || 0),
                    maxAllowedAccuracy: Math.round(attempt.maxAllowedAccuracy || 100),
                    createdAt: attempt.createdAt
                };
            })
        });

    } catch (err) {
        console.log("TEACHER RECENT SUSPICIOUS ATTEMPTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Unable to load suspicious attempts."
        });
    }
});

router.get("/live-map/session/:sessionId", isTeacher, async function (req, res) {
    try {
        const sessionId = req.params.sessionId;

        if (!sessionId || !sessionId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance session."
            });
        }

        const session = await AttendanceSession.findOne({
            _id: sessionId,
            teacher: req.user._id,
            college: req.user.college,
            isActive: true,
            status: "ACTIVE"
        })
            .select("_id teacher classGroup latitude longitude radius endTime liveDevices")
            .populate("classGroup", "name");

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Live attendance session was not found."
            });
        }

        const classGroupId = session.classGroup
            ? session.classGroup._id || session.classGroup
            : null;

        const students = classGroupId
            ? await Student.find({
                college: req.user.college,
                classGroup: classGroupId,
                isDeleted: { $ne: true },
                isBlocked: { $ne: true }
            })
                .select("fullName enrollmentNumber email")
                .sort({ fullName: 1 })
                .lean()
            : [];

        const snapshot = Array.isArray(session.liveDevices)
            ? session.liveDevices
                .map(function (device) {
                    return mapTeacherLiveDevice(device, session._id);
                })
                .filter(Boolean)
            : [];

        res.json({
            success: true,
            sessionId: session._id.toString(),
            latitude: Number(session.latitude || 0),
            longitude: Number(session.longitude || 0),
            radius: Number(session.radius || 0),
            endTime: session.endTime,
            classGroupName: session.classGroup ? session.classGroup.name || "" : "",
            roster: students.map(function (student) {
                return {
                    studentId: student._id.toString(),
                    fullName: student.fullName || "Student",
                    enrollmentNumber: student.enrollmentNumber || student.email || ""
                };
            }),
            snapshot: snapshot
        });
    } catch (err) {
        console.log("TEACHER LIVE MAP SESSION ERROR:");
        console.log(err.message);

        res.status(500).json({
            success: false,
            message: "Unable to load live map session."
        });
    }
});

router.get("/live-map/global", isTeacher, async function (req, res) {
    try {
        const students = await Student.find({
            college: req.user.college,
            isDeleted: { $ne: true },
            isBlocked: { $ne: true }
        })
            .select("fullName enrollmentNumber email lastLocation")
            .sort({ fullName: 1 })
            .lean();

        const now = Date.now();
        const OFFLINE_THRESHOLD_MS = 45000;

        const snapshot = students.map(student => {
            const hasLocation = student.lastLocation && student.lastLocation.latitude;
            const updatedAt = hasLocation ? new Date(student.lastLocation.updatedAt).getTime() : 0;
            const isOnline = hasLocation && (now - updatedAt) < OFFLINE_THRESHOLD_MS;

            return {
                sessionId: "global",
                studentId: student._id.toString(),
                studentName: student.fullName || "Student",
                enrollmentNumber: student.enrollmentNumber || student.email || "",
                deviceId: "default",
                deviceLabel: "Browser",
                latitude: hasLocation ? student.lastLocation.latitude : 0,
                longitude: hasLocation ? student.lastLocation.longitude : 0,
                accuracy: hasLocation ? student.lastLocation.accuracy : null,
                status: isOnline ? "GLOBAL_TRACKING" : "OFFLINE",
                online: isOnline,
                updatedAt: hasLocation ? new Date(student.lastLocation.updatedAt) : new Date(0)
            };
        }).filter(device => device.latitude !== 0 || device.online);

        res.json({
            success: true,
            sessionId: "global",
            latitude: 0,
            longitude: 0,
            radius: 0,
            endTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
            classGroupName: "All College Students",
            roster: students.map(function (student) {
                return {
                    studentId: student._id.toString(),
                    fullName: student.fullName || "Student",
                    enrollmentNumber: student.enrollmentNumber || student.email || ""
                };
            }),
            snapshot: snapshot
        });
    } catch (err) {
        console.error("TEACHER GLOBAL LIVE MAP ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Unable to load global map."
        });
    }
});

router.post("/attendance/start", isTeacher, async (req, res) => {
    try {
        let durationMinutes = Number(req.body.durationMinutes);
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) durationMinutes = 1;
        if (durationMinutes > 15) durationMinutes = 15;

        const teacherLatitude = req.body.teacherLatitude;
        const teacherLongitude = req.body.teacherLongitude;
        const teacherAccuracy = req.body.teacherAccuracy;
        
        let locationMeta = null;
        if (req.body.locationMeta) {
            try {
                locationMeta = typeof req.body.locationMeta === 'string' ? JSON.parse(req.body.locationMeta) : req.body.locationMeta;
            } catch (e) {
                console.error("Failed to parse locationMeta:", e);
            }
        }

        const scheduleItem = await getScheduleForTeacher(req);

        if (
            !scheduleItem ||
            !scheduleItem.subject ||
            !scheduleItem.classGroup ||
            !scheduleItem.classroom
        ) {
            return res.redirect("/teacher/dashboard?error=schedule_missing");
        }

        if (
            teacherLatitude == null ||
            teacherLatitude === "" ||
            teacherLongitude == null ||
            teacherLongitude === ""
        ) {
            return res.redirect("/teacher/dashboard?error=location");
        }

        if (!isValidCoordinate(Number(teacherLatitude), Number(teacherLongitude))) {
            return res.redirect("/teacher/dashboard?error=invalid_teacher_location");
        }

        const hasClassroomPreset = scheduleItem.classroom &&
            scheduleItem.classroom.latitude &&
            scheduleItem.classroom.longitude &&
            scheduleItem.classroom.latitude !== 0 &&
            scheduleItem.classroom.longitude !== 0;

        if (!hasClassroomPreset && !isUsableAccuracy(teacherAccuracy)) {
            return res.redirect("/teacher/dashboard?error=teacher_location_accuracy_low");
        }

        logGpsDecision("teacher-start-attendance", {
            teacherId: (req.user._id || req.user.id).toString(),
            scheduleId: scheduleItem._id.toString(),
            teacherLatitude: Number(teacherLatitude),
            teacherLongitude: Number(teacherLongitude),
            teacherAccuracy: Number(teacherAccuracy),
            classroomRadius: Number(scheduleItem.classroom.radius || 100),
            locationMeta: locationMeta || null
        });

        const timeStatus = getScheduleTimeStatus(
            scheduleItem.startTime,
            scheduleItem.endTime,
            new Date()
        );

        if (timeStatus !== "live") {
            return res.redirect("/teacher/dashboard?error=outside_window");
        }

        // Close any expired sessions that are stuck in ACTIVE state (e.g. cron job failed)
        await AttendanceSession.updateMany({
            schedule: scheduleItem._id,
            status: "ACTIVE",
            isActive: true,
            endTime: { $lt: new Date() }
        }, {
            $set: {
                status: "CLOSED",
                isActive: false,
                closedAt: new Date()
            }
        });

        const alreadyActive = await AttendanceSession.findOne({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            college: req.user.college,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: new Date() }
        });

        if (alreadyActive) {
            return res.redirect("/teacher/dashboard?error=active_session_exists");
        }

        const previousSession = await getLatestTodaySessionForSchedule(
            scheduleItem,
            req.user._id,
            req.user.college
        );

        // Prevent double-click race conditions from triggering "Attendance Restarted"
        if (previousSession && (Date.now() - previousSession.createdAt.getTime() < 15000)) {
            return res.redirect("/teacher/dashboard?message=live_started");
        }

        const classEndTime = getScheduleDateTimeForToday(scheduleItem.endTime);
        const requestedEndTime = new Date(Date.now() + durationMinutes * 60 * 1000);

        let sessionEndTime = requestedEndTime;

        if (classEndTime && requestedEndTime > classEndTime) {
            sessionEndTime = classEndTime;
        }

        // Ensure the session is active for at least 1 minute, even if the class has formally ended
        // This prevents the session from being immediately closed by cron or hidden from the UI.
        if (sessionEndTime.getTime() - Date.now() < 60000) {
            sessionEndTime = new Date(Date.now() + 60000);
        }

        let attendanceSession;

        let finalLatitude = Number(teacherLatitude) || 0;
        let finalLongitude = Number(teacherLongitude) || 0;
        let finalLocationSource = "TEACHER_GPS";

        // Prioritize Admin-verified classroom coordinates if they exist
        // This permanently fixes the issue where a Teacher on a MacBook gets inaccurate Wi-Fi triangulation
        if (
            scheduleItem.classroom &&
            scheduleItem.classroom.latitude &&
            scheduleItem.classroom.longitude &&
            scheduleItem.classroom.latitude !== 0 &&
            scheduleItem.classroom.longitude !== 0
        ) {
            finalLatitude = scheduleItem.classroom.latitude;
            finalLongitude = scheduleItem.classroom.longitude;
            finalLocationSource = "CLASSROOM_PRESET";
        }

        if (previousSession) {
            previousSession.endTime = sessionEndTime;
            previousSession.scheduledEndTime = classEndTime || sessionEndTime;
            previousSession.status = "ACTIVE";
            previousSession.isActive = true;
            previousSession.latitude = finalLatitude;
            previousSession.longitude = finalLongitude;
            previousSession.teacherGpsAccuracy = Number(teacherAccuracy) || 0;
            previousSession.locationSource = finalLocationSource;
            previousSession.locationMeta = locationMeta;
            previousSession.radius = scheduleItem.classroom.radius || 100;

            // Clear finalization state so the reopened session behaves as open
            // Without this, canOverrideAbsent sees a "finalized" session and may block
            previousSession.absentsMarkedAt = undefined;
            previousSession.closedBy = undefined;
            previousSession.closedAt = undefined;

            attendanceSession = await previousSession.save();
        } else {
            const rawResult = await AttendanceSession.findOneAndUpdate(
                {
                    schedule: scheduleItem._id,
                    status: "ACTIVE",
                    isActive: true
                },
                {
                    $setOnInsert: {
                        schedule: scheduleItem._id,
                        teacher: req.user._id,
                        subject: scheduleItem.subject ? scheduleItem.subject._id : scheduleItem.subject,
                        college: req.user.college,
                        classGroup: scheduleItem.classGroup ? scheduleItem.classGroup._id : scheduleItem.classGroup,
                        classroom: scheduleItem.classroom ? scheduleItem.classroom._id : scheduleItem.classroom,

                        latitude: finalLatitude,
                        longitude: finalLongitude,
                        teacherGpsAccuracy: Number(teacherAccuracy) || 0,
                        locationSource: finalLocationSource,
                        locationMeta: locationMeta,
                        radius: scheduleItem.classroom.radius || 100,

                        startTime: new Date(),
                        endTime: sessionEndTime,
                        scheduledEndTime: classEndTime || sessionEndTime,
                        status: "ACTIVE",
                        isActive: true
                    }
                },
                { upsert: true, new: true, rawResult: true }
            );
            
            attendanceSession = rawResult.value || rawResult;
        }

        if (previousSession) {
            socketManager.emitAttendanceReopened(attendanceSession, scheduleItem);
        } else {
            socketManager.emitAttendanceStarted(attendanceSession, scheduleItem);
        }

        setTimeout(async () => {
            try {
                const webpush = require("web-push");
                if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                    webpush.setVapidDetails(
                        process.env.VAPID_SUBJECT || "mailto:admin@attendify.com",
                        process.env.VAPID_PUBLIC_KEY,
                        process.env.VAPID_PRIVATE_KEY
                    );

                    const subjectName = scheduleItem.subject ? scheduleItem.subject.subjectName : "a subject";
                    const isRestart = !!previousSession;
                    const payload = JSON.stringify({
                        title: isRestart ? "Attendance Restarted" : "Attendance Started",
                        body: isRestart 
                            ? `Your teacher has restarted attendance for ${subjectName}. If you missed it, mark it now.` 
                            : `Your teacher has started attendance for ${subjectName}. Click here to mark it now.`,
                        url: "/student/dashboard"
                    });

                    const Student = require("../models/studentSchema");
                    const studentsToPush = await Student.find({
                        classGroup: scheduleItem.classGroup._id,
                        isDeleted: { $ne: true }
                    });

                    studentsToPush.forEach(student => {
                        if (student.pushSubscriptions && student.pushSubscriptions.length > 0) {
                            student.pushSubscriptions.forEach(sub => {
                                webpush.sendNotification(sub, payload).catch(err => {
                                    console.log("Push error for student", student.email, err.message);
                                });
                            });
                        }
                    });
                }
            } catch(e) {
                console.log("Push trigger error", e);
            }
        }, 0);

        if (previousSession) {
            return res.redirect("/teacher/dashboard?message=live_restarted");
        }

        res.redirect("/teacher/dashboard?message=live_started");

    } catch (err) {
        console.log("TEACHER START ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});

router.post("/attendance/manual", isTeacher, async function (req, res) {
    const scheduleId = req.body.scheduleId;

    if (scheduleId) {
        return res.redirect("/teacher/manual-attendance/" + scheduleId);
    }

    res.redirect("/teacher/manual-attendance");
});

router.post("/attendance/end/:id", isTeacher, async (req, res) => {
    try {
        const session = await AttendanceSession.findOne({
            _id: req.params.id,
            teacher: req.user._id,
            college: req.user.college
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        if (!session) {
            return res.send("Attendance session not found");
        }

        // Only auto-mark absents when the scheduled class time is truly over.
        // Ending a session early must NOT mark remaining students absent.
        let shouldAutoMarkAbsents = false;

        if (session.schedule && session.schedule.endTime) {
            const classEndTime = getScheduleDateTimeForToday(session.schedule.endTime);
            if (classEndTime && new Date() > classEndTime) {
                shouldAutoMarkAbsents = true;
            }
        }

        if (shouldAutoMarkAbsents) {
            await finalizeAbsencesForSession(session, {
                userAgent: req.headers["user-agent"],
                ip: req.ip,
                emit: false
            });
        }

        session.isActive = false;
        session.status = "CLOSED";
        session.closedAt = new Date();
        session.closedBy = req.user._id;

        await session.save();

        socketManager.emitAttendanceEnded(session);

        res.redirect("/teacher/dashboard");

    } catch (err) {
        console.log("TEACHER END ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});

router.get("/reports", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const collegeId = req.user.college;

        const todayInput = teacherGetDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            classroomId: req.query.classroomId || "all",
            status: req.query.status || "all"
        };

        const fromDate = teacherGetStartOfDate(filters.fromDate);
        const toDate = teacherGetEndOfDate(filters.toDate);

        const classGroupId = teacherSafeObjectId(filters.classGroupId);
        const subjectId = teacherSafeObjectId(filters.subjectId);
        const classroomId = teacherSafeObjectId(filters.classroomId);

        const teacherSchedules = await Schedule.find({
            college: collegeId,
            teacher: teacherId
        })
            .populate("classGroup")
            .populate("subject")
            .sort({
                day: 1,
                startTime: 1
            });

        const classGroupIdMap = {};
        const subjectIdMap = {};
        const classroomIdMap = {};

        teacherSchedules.forEach(function (schedule) {
            if (schedule.classGroup) {
                classGroupIdMap[schedule.classGroup._id.toString()] = true;
            }

            if (schedule.subject) {
                subjectIdMap[schedule.subject._id.toString()] = true;
            }

            if (schedule.classroom) {
                classroomIdMap[schedule.classroom._id.toString()] = true;
            }
        });

        const classGroups = await ClassGroup.find({
            _id: { $in: Object.keys(classGroupIdMap) },
            college: collegeId
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const subjects = await Subject.find({
            _id: { $in: Object.keys(subjectIdMap) },
            college: collegeId
        })
            .populate("classGroup")
            .sort({
                subjectName: 1
            });

        const classrooms = await Classroom.find({
            _id: { $in: Object.keys(classroomIdMap) },
            college: collegeId
        }).sort({
            classroomName: 1
        });

        const sessionQuery = {
            college: collegeId,
            teacher: teacherId,
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

        if (classroomId) {
            sessionQuery.classroom = classroomId;
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
                select: "startTime"
            })
            .sort({
                createdAt: -1
            })
            .limit(1000);

        let totalPresent = 0;
        let totalAbsent = 0;

        const subjectSummaryMap = {};
        const classSummaryMap = {};
        const studentSummaryMap = {};

        attendanceRecords.forEach(function (record) {
            if (teacherIsPositiveAttendanceStatus(record.status)) {
                totalPresent++;
            }

            if (record.status === "ABSENT") {
                totalAbsent++;
            }

            const subjectKey = record.subject
                ? record.subject._id.toString()
                : "missing-subject";

            if (!subjectSummaryMap[subjectKey]) {
                subjectSummaryMap[subjectKey] = {
                    name: record.subject ? record.subject.subjectName : "Subject Missing",
                    code: record.subject && record.subject.subjectCode ? record.subject.subjectCode : "",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            subjectSummaryMap[subjectKey].total++;

            if (teacherIsPositiveAttendanceStatus(record.status)) {
                subjectSummaryMap[subjectKey].present++;
            }

            if (record.status === "ABSENT") {
                subjectSummaryMap[subjectKey].absent++;
            }

            const classKey = record.classGroup
                ? record.classGroup._id.toString()
                : "missing-class";

            if (!classSummaryMap[classKey]) {
                classSummaryMap[classKey] = {
                    name: record.classGroup ? record.classGroup.name : "Class Missing",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            classSummaryMap[classKey].total++;

            if (teacherIsPositiveAttendanceStatus(record.status)) {
                classSummaryMap[classKey].present++;
            }

            if (record.status === "ABSENT") {
                classSummaryMap[classKey].absent++;
            }

            const studentKey = record.student
                ? record.student._id.toString()
                : "missing-student";

            if (!studentSummaryMap[studentKey]) {
                studentSummaryMap[studentKey] = {
                    name: record.student ? record.student.fullName : "Student Missing",
                    enrollmentNumber: record.student && record.student.enrollmentNumber ? record.student.enrollmentNumber : "",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            studentSummaryMap[studentKey].total++;

            if (teacherIsPositiveAttendanceStatus(record.status)) {
                studentSummaryMap[studentKey].present++;
            }

            if (record.status === "ABSENT") {
                studentSummaryMap[studentKey].absent++;
            }
        });

        const subjectSummary = Object.values(subjectSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const classSummary = Object.values(classSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const studentSummary = Object.values(studentSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const attemptQuery = {
            college: collegeId,
            teacher: teacherId,
            result: { $ne: "SUCCESS" },
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

        if (classroomId) {
            attemptQuery.classroom = classroomId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .populate("student")
            .populate("subject")
            .populate("classGroup")
            .populate("classroom")
            .sort({
                createdAt: -1
            })
            .limit(50);

        const summary = {
            totalSessions: sessions.length,
            totalRecords: attendanceRecords.length,
            totalPresent: totalPresent,
            totalAbsent: totalAbsent,
            attendancePercentage: teacherGetPercent(totalPresent, attendanceRecords.length),
            suspiciousCount: suspiciousAttempts.length
        };

        res.render("teacherReports", {
            teacher: req.user,
            activePage: "reports",
            filters: filters,
            classGroups: classGroups,
            subjects: subjects,
            classrooms: classrooms,
            sessions: sessions,
            attendanceRecords: attendanceRecords,
            suspiciousAttempts: suspiciousAttempts,
            subjectSummary: subjectSummary,
            classSummary: classSummary,
            studentSummary: studentSummary,
            summary: summary
        });

    } catch (err) {
        console.log("TEACHER REPORTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Teacher reports error: " + "An internal server error occurred.");
    }
});

router.get("/attendance/export/:sessionId", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const sessionId = req.params.sessionId;

        const session = await AttendanceSession.findOne({
            _id: sessionId,
            teacher: teacherId
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        if (!session) {
            return res.status(404).send("Session not found.");
        }

        const attendanceRecords = await AttendanceRecord.find({
            attendanceSession: sessionId
        })
        .populate("student")
        .populate("subject")
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
            "Student Email",
            "Status",
            "Verification Method",
            "GPS Accuracy (m)",
            "Marked At"
        ]);

        attendanceRecords.forEach(function (record) {
            const sessionDate = session.startTime || record.createdAt;

            rows.push([
                sessionDate ? new Date(sessionDate).toLocaleDateString() : "",
                sessionDate ? new Date(sessionDate).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                }) : "",

                record.student ? record.student.fullName : "Student Missing",
                record.student && record.student.enrollmentNumber ? record.student.enrollmentNumber : "",
                record.student && record.student.email ? record.student.email : "",

                record.status || "",
                record.verificationMethod || "",

                record.deviceInfo && record.deviceInfo.gpsAccuracy
                    ? Math.round(record.deviceInfo.gpsAccuracy)
                    : "",

                record.createdAt ? new Date(record.createdAt).toLocaleString() : ""
            ]);
        });

        const safeSubject = session.subject ? session.subject.subjectName.replace(/[^a-zA-Z0-9]/g, "-") : "Session";
        const sessionDate = session.startTime ? new Date(session.startTime).toLocaleDateString().replace(/\//g, "-") : "Date";
        
        const filename = "Attendance-" + safeSubject + "-" + sessionDate + ".csv";

        teacherSendCsvResponse(res, filename, rows);

    } catch (err) {
        console.log("TEACHER EXPORT SINGLE SESSION ERROR:");
        console.log(err.message);
        console.log(err.stack);
        res.status(500).send("Unable to export session.");
    }
});

router.get("/reports/export-attendance", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const collegeId = req.user.college;

        const todayInput = teacherGetDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            classroomId: req.query.classroomId || "all",
            status: req.query.status || "all"
        };

        const fromDate = teacherGetStartOfDate(filters.fromDate);
        const toDate = teacherGetEndOfDate(filters.toDate);

        const classGroupId = teacherSafeObjectId(filters.classGroupId);
        const subjectId = teacherSafeObjectId(filters.subjectId);
        const classroomId = teacherSafeObjectId(filters.classroomId);

        const sessionQuery = {
            college: collegeId,
            teacher: teacherId,
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

        if (classroomId) {
            sessionQuery.classroom = classroomId;
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
                populate: [
                    { path: "teacher" },
                    { path: "schedule" },
                    { path: "subject" },
                    { path: "classGroup" },
                    { path: "classroom" }
                ]
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
            "teacher-attendance-report-" +
            filters.fromDate +
            "-to-" +
            filters.toDate +
            ".csv";

        teacherSendCsvResponse(res, filename, rows);

    } catch (err) {
        console.log("TEACHER EXPORT ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/reports");
    }
});


router.get("/reports/export-suspicious", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const collegeId = req.user.college;

        const todayInput = teacherGetDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            classroomId: req.query.classroomId || "all"
        };

        const fromDate = teacherGetStartOfDate(filters.fromDate);
        const toDate = teacherGetEndOfDate(filters.toDate);

        const classGroupId = teacherSafeObjectId(filters.classGroupId);
        const subjectId = teacherSafeObjectId(filters.subjectId);
        const classroomId = teacherSafeObjectId(filters.classroomId);

        const attemptQuery = {
            college: collegeId,
            teacher: teacherId,
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

        if (classroomId) {
            attemptQuery.classroom = classroomId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .populate("student")
            .populate("attendanceSession")
            .populate("subject")
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
            "teacher-suspicious-attempts-" +
            filters.fromDate +
            "-to-" +
            filters.toDate +
            ".csv";

        teacherSendCsvResponse(res, filename, rows);

    } catch (err) {
        console.log("TEACHER EXPORT SUSPICIOUS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/teacher/reports");
    }
});

router.get("/manual-attendance", isTeacher, async function (req, res) {
    try {
        const today = getTodayName();
        const now = new Date();
        const todayInput = teacherGetDateInputValue(now);
        const selectedDateInput = teacherNormalizeManualDateInput(req.query.date);
        const selectedDateStart = teacherGetStartOfDate(selectedDateInput);
        const selectedDateEnd = teacherGetEndOfDate(selectedDateInput);
        const selectedDayName = teacherGetDayNameFromDate(selectedDateStart);
        const isSelectedToday = selectedDateInput === todayInput;
        const statusReferenceDate = isSelectedToday ? now : selectedDateEnd;
        const previousDate = new Date(selectedDateStart);
        previousDate.setDate(previousDate.getDate() - 1);
        const nextDate = new Date(selectedDateStart);
        nextDate.setDate(nextDate.getDate() + 1);
        const minSelectableDate = new Date(now);
        minSelectableDate.setDate(minSelectableDate.getDate() - 120);
        const nextDateInput = teacherGetDateInputValue(nextDate);

        const schedules = await Schedule.find({
            teacher: req.user._id,
            college: req.user.college,
            day: selectedDayName
        })
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        sortSchedulesByTime(schedules);

        const selectedDateSessions = await AttendanceSession.find({
            teacher: req.user._id,
            college: req.user.college,
            startTime: {
                $gte: selectedDateStart,
                $lte: selectedDateEnd
            }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        const manualSchedules = [];
        let validScheduleCount = 0;

        for (let i = 0; i < schedules.length; i++) {
            const scheduleItem = schedules[i];

            if (!scheduleItem.subject || !scheduleItem.classGroup || !scheduleItem.classroom) {
                continue;
            }

            validScheduleCount++;

            const timeStatus = getScheduleTimeStatus(
                scheduleItem.startTime,
                scheduleItem.endTime,
                statusReferenceDate
            );

            const selectedDateSession = findSessionForSchedule(
                selectedDateSessions,
                scheduleItem
            );

            if (timeStatus === "ended") {
                let isRecorded = false;

                if (selectedDateSession) {
                    if (
                        selectedDateSession.attendanceRecords &&
                        selectedDateSession.attendanceRecords.length > 0
                    ) {
                        isRecorded = true;
                    } else {
                        const savedRecordCount = await AttendanceRecord.countDocuments({
                            attendanceSession: selectedDateSession._id
                        });

                        isRecorded = savedRecordCount > 0;
                    }
                }

                manualSchedules.push({
                    schedule: scheduleItem,
                    todaySession: selectedDateSession,
                    isRecorded: isRecorded
                });
            }
        }

        const recordedCount = manualSchedules.filter(function (item) {
            return item.isRecorded;
        }).length;

        const manualDateOptions = [];

        for (let i = 0; i < 14; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            const dateInput = teacherGetDateInputValue(date);
            let quickLabel = teacherGetDayNameFromDate(date);

            if (i === 0) {
                quickLabel = "Today";
            } else if (i === 1) {
                quickLabel = "Yesterday";
            }

            manualDateOptions.push({
                dateInput: dateInput,
                label: teacherGetManualDateLabel(dateInput),
                shortLabel: new Date(dateInput + "T00:00:00").toLocaleDateString([], {
                    day: "2-digit",
                    month: "short"
                }),
                dayName: teacherGetDayNameFromDate(date),
                quickLabel: quickLabel,
                isToday: dateInput === todayInput
            });
        }

        res.render("teacherManualAttendance", {
            teacher: req.user,
            activePage: "manual-attendance",
            today: today,
            selectedDateInput: selectedDateInput,
            selectedDateLabel: teacherGetManualDateLabel(selectedDateInput),
            selectedDayName: selectedDayName,
            manualDatePreviousInput: teacherGetDateInputValue(previousDate),
            manualDateNextInput: nextDateInput <= todayInput ? nextDateInput : "",
            manualDateMinInput: teacherGetDateInputValue(minSelectableDate),
            manualDateMaxInput: todayInput,
            manualSummary: {
                totalClasses: validScheduleCount,
                manualEligibleClasses: manualSchedules.length,
                recordedClasses: recordedCount,
                pendingClasses: Math.max(manualSchedules.length - recordedCount, 0)
            },
            manualDateOptions: manualDateOptions,
            manualSchedules: manualSchedules,
            selectedSchedule: null,
            students: [],
            existingRecordsByStudent: {},
            message: getSuccessMessage(req.query.message),
            error: getErrorMessage(req.query.error)
        });

    } catch (err) {
        console.log("TEACHER MANUAL ATTENDANCE PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});

router.get("/manual-attendance/:scheduleId", isTeacher, async function (req, res) {
    try {
        const scheduleId = req.params.scheduleId;
        const selectedDateInput = teacherNormalizeManualDateInput(req.query.date);
        const selectedDateStart = teacherGetStartOfDate(selectedDateInput);
        const selectedDateEnd = teacherGetEndOfDate(selectedDateInput);
        const selectedDayName = teacherGetDayNameFromDate(selectedDateStart);
        const todayInput = teacherGetDateInputValue(new Date());
        const previousDate = new Date(selectedDateStart);
        previousDate.setDate(previousDate.getDate() - 1);
        const nextDate = new Date(selectedDateStart);
        nextDate.setDate(nextDate.getDate() + 1);
        const minSelectableDate = new Date();
        minSelectableDate.setDate(minSelectableDate.getDate() - 120);
        const nextDateInput = teacherGetDateInputValue(nextDate);
        const statusReferenceDate =
            selectedDateInput === todayInput
                ? new Date()
                : selectedDateEnd;
        const manualAttendanceDatePath =
            "/teacher/manual-attendance?date=" + selectedDateInput;

        if (!scheduleId || !scheduleId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.redirect(manualAttendanceDatePath + "&error=schedule_missing");
        }

        const scheduleItem = await Schedule.findOne({
            _id: scheduleId,
            teacher: req.user._id,
            college: req.user.college,
            day: selectedDayName
        })
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        if (
            !scheduleItem ||
            !scheduleItem.subject ||
            !scheduleItem.classGroup ||
            !scheduleItem.classroom
        ) {
            return res.redirect(manualAttendanceDatePath + "&error=schedule_missing");
        }

        const timeStatus = getScheduleTimeStatus(
            scheduleItem.startTime,
            scheduleItem.endTime,
            statusReferenceDate
        );

        if (timeStatus !== "ended") {
            return res.redirect(manualAttendanceDatePath + "&error=class_not_ended");
        }

        const students = await Student.find({
            college: req.user.college,
            classGroup: scheduleItem.classGroup._id,
            isDeleted: { $ne: true }
        }).sort({
            fullName: 1
        });

        const session = await getLatestSessionForScheduleByDate(
            scheduleItem,
            req.user._id,
            req.user.college,
            selectedDateInput
        );

        const existingRecordsByStudent = {};

        if (session) {
            const existingRecords = await AttendanceRecord.find({
                attendanceSession: session._id
            });

            for (let i = 0; i < existingRecords.length; i++) {
                existingRecordsByStudent[existingRecords[i].student.toString()] = existingRecords[i].status;
            }
        }

        res.render("teacherManualAttendance", {
            teacher: req.user,
            activePage: "manual-attendance",
            today: getTodayName(),
            selectedDateInput: selectedDateInput,
            selectedDateLabel: teacherGetManualDateLabel(selectedDateInput),
            selectedDayName: selectedDayName,
            manualDatePreviousInput: teacherGetDateInputValue(previousDate),
            manualDateNextInput: nextDateInput <= todayInput ? nextDateInput : "",
            manualDateMinInput: teacherGetDateInputValue(minSelectableDate),
            manualDateMaxInput: todayInput,
            manualSummary: null,
            manualDateOptions: [],
            manualSchedules: [],
            selectedSchedule: scheduleItem,
            students: students,
            existingRecordsByStudent: existingRecordsByStudent,
            message: getSuccessMessage(req.query.message),
            error: getErrorMessage(req.query.error)
        });

    } catch (err) {
        console.log("TEACHER MANUAL ATTENDANCE DETAIL PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});

router.post("/manual-attendance/:scheduleId", isTeacher, async function (req, res) {
    try {
        const scheduleId = req.params.scheduleId;
        const selectedDateInput = teacherNormalizeManualDateInput(req.query.date);
        const selectedDateStart = teacherGetStartOfDate(selectedDateInput);
        const selectedDateEnd = teacherGetEndOfDate(selectedDateInput);
        const selectedDayName = teacherGetDayNameFromDate(selectedDateStart);
        const todayInput = teacherGetDateInputValue(new Date());
        const statusReferenceDate =
            selectedDateInput === todayInput
                ? new Date()
                : selectedDateEnd;
        const manualAttendanceDatePath =
            "/teacher/manual-attendance?date=" + selectedDateInput;
        let presentStudentIds = req.body.presentStudents || [];

        if (!Array.isArray(presentStudentIds)) {
            presentStudentIds = [presentStudentIds];
        }

        if (!scheduleId || !scheduleId.match(/^[0-9a-fA-F]{24}$/)) {
            return res.redirect(manualAttendanceDatePath + "&error=schedule_missing");
        }

        const scheduleItem = await Schedule.findOne({
            _id: scheduleId,
            teacher: req.user._id,
            college: req.user.college,
            day: selectedDayName
        })
            .populate("subject")
            .populate("classGroup")
            .populate("classroom");

        if (
            !scheduleItem ||
            !scheduleItem.subject ||
            !scheduleItem.classGroup ||
            !scheduleItem.classroom
        ) {
            return res.redirect(manualAttendanceDatePath + "&error=schedule_missing");
        }

        const timeStatus = getScheduleTimeStatus(
            scheduleItem.startTime,
            scheduleItem.endTime,
            statusReferenceDate
        );

        if (timeStatus !== "ended") {
            return res.redirect(manualAttendanceDatePath + "&error=class_not_ended");
        }

        const students = await Student.find({
            college: req.user.college,
            classGroup: scheduleItem.classGroup._id,
            isDeleted: { $ne: true }
        }).sort({
            fullName: 1
        });

        if (!students || students.length === 0) {
            return res.redirect(
                "/teacher/manual-attendance/" +
                    scheduleItem._id +
                    "?date=" +
                    selectedDateInput +
                    "&error=no_students"
            );
        }

        const presentIdStrings = presentStudentIds.map(function (id) {
            return id.toString();
        });

        let session = await getLatestSessionForScheduleByDate(
            scheduleItem,
            req.user._id,
            req.user.college,
            selectedDateInput
        );

        if (!session) {
            const scheduleStartTime = getScheduleDateTimeForToday(scheduleItem.startTime);
            const scheduleEndTime = getScheduleDateTimeForToday(scheduleItem.endTime);
            const manualSessionStart = teacherGetStartOfDate(selectedDateInput);
            const manualSessionEnd = teacherGetStartOfDate(selectedDateInput);

            if (scheduleStartTime) {
                manualSessionStart.setHours(
                    scheduleStartTime.getHours(),
                    scheduleStartTime.getMinutes(),
                    0,
                    0
                );
            }

            if (scheduleEndTime) {
                manualSessionEnd.setHours(
                    scheduleEndTime.getHours(),
                    scheduleEndTime.getMinutes(),
                    0,
                    0
                );
            } else {
                manualSessionEnd.setHours(
                    manualSessionStart.getHours(),
                    manualSessionStart.getMinutes() + 45,
                    0,
                    0
                );
            }

            session = await AttendanceSession.create({
                schedule: scheduleItem._id,
                teacher: req.user._id,
                subject: scheduleItem.subject._id,
                college: req.user.college,
                classGroup: scheduleItem.classGroup._id,
                classroom: scheduleItem.classroom._id,
                latitude: scheduleItem.classroom.latitude || 0,
                longitude: scheduleItem.classroom.longitude || 0,
                radius: scheduleItem.classroom.radius || 100,
                startTime: manualSessionStart,
                endTime: manualSessionEnd,
                scheduledEndTime: manualSessionEnd,
                status: "CLOSED",
                isActive: false,
                closedAt: new Date(),
                closedBy: req.user._id
            });
        }

        const recordIds = [];
        const presentStudentSnapshots = [];
        const absentStudentSnapshots = [];

        for (let i = 0; i < students.length; i++) {
            const oneStudent = students[i];
            const isPresent = presentIdStrings.includes(oneStudent._id.toString());

            const record = await AttendanceRecord.findOneAndUpdate(
                {
                    student: oneStudent._id,
                    attendanceSession: session._id
                },
                {
                    $set: {
                        student: oneStudent._id,
                        attendanceSession: session._id,
                        subject: scheduleItem.subject._id,
                        college: req.user.college,
                        classGroup: scheduleItem.classGroup._id,
                        classroom: scheduleItem.classroom._id,
                        status: isPresent ? "PRESENT" : "ABSENT",
                        latitude: scheduleItem.classroom.latitude || 0,
                        longitude: scheduleItem.classroom.longitude || 0,
                        distanceFromClassroom: 0,
                        verificationMethod: "MANUAL",
                        markedAt: new Date(),
                        deviceInfo: {
                            userAgent: req.headers["user-agent"],
                            ip: req.ip
                        }
                    }
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );

            recordIds.push(record._id);

            const studentSnapshot = {
                student: oneStudent._id,
                fullName: oneStudent.fullName,
                enrollmentNumber: oneStudent.enrollmentNumber,
                status: isPresent ? "PRESENT" : "ABSENT",
                attendanceRecord: record._id,
                markedAt: new Date(),
                verificationMethod: "MANUAL",
                distanceFromClassroom: 0
            };

            if (isPresent) {
                presentStudentSnapshots.push(studentSnapshot);
            } else {
                absentStudentSnapshots.push(studentSnapshot);
            }
        }

        session.attendanceRecords = recordIds;
        session.presentStudents = presentStudentSnapshots;
        session.absentStudents = absentStudentSnapshots;

        session.attendanceSummary = {
            totalPresent: presentStudentSnapshots.length,
            totalAbsent: absentStudentSnapshots.length,
            totalMarked: presentStudentSnapshots.length + absentStudentSnapshots.length
        };

        session.isActive = false;
        session.status = "CLOSED";
        session.closedAt = new Date();
        session.absentsMarkedAt = new Date();
        session.closedBy = req.user._id;

        await session.save();
        socketManager.emitAttendanceEnded(session);

        res.redirect(
            "/teacher/manual-attendance/" +
                scheduleItem._id +
                "?date=" +
                selectedDateInput +
                "&message=manual_saved"
        );

    } catch (err) {
        console.log("TEACHER MANUAL ATTENDANCE SAVE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Something went wrong. Please try again.");
    }
});


// ── REALTIME POLLING FALLBACK ────────────────────────────────────────────────
router.get("/realtime/poll", isTeacher, async function (req, res) {
    try {
        const unreadCount = await getUnreadCount(getTeacherNotificationFilter(req.user));

        // Fetch recent suspicious attempts if any
        let recentSuspiciousAttempts = null;
        if (req.query.includeSuspicious === "true") {
            const AttendanceAttempt = require("../models/attendanceAttemptSchema");
            const recentAttempts = await AttendanceAttempt.find({
                "session.teacher": req.user._id,
                result: "REJECTED"
            })
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("student", "fullName enrollmentNumber");

            recentSuspiciousAttempts = recentAttempts.map(attempt => ({
                attemptId: attempt._id.toString(),
                studentName: attempt.student ? attempt.student.fullName : "Unknown",
                enrollmentNumber: attempt.student ? attempt.student.enrollmentNumber : "Unknown",
                reasonCode: attempt.reasonCode,
                reasonMessage: attempt.reasonMessage,
                distanceFromTeacher: attempt.distance,
                allowedRadius: attempt.allowedRadius,
                gpsAccuracy: attempt.accuracy,
                createdAt: attempt.createdAt
            }));
        }

        // Fetch active session states for realtime polling
        const activeSessions = await AttendanceSession.find({
            teacher: req.user._id,
            isActive: true,
            status: "ACTIVE"
        }).select("_id presentStudents");

        const sessionStates = activeSessions.map(function(s) {
            return {
                sessionId: s._id.toString(),
                presentCount: s.presentStudents ? s.presentStudents.length : 0,
                presentStudents: s.presentStudents || []
            };
        });

        const since = Number(req.query.since) || 0;
        let needsReload = false;

        if (since > 0) {
            const majorChanges = await AttendanceSession.countDocuments({
                teacher: req.user._id,
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
                    college: req.user.college,
                    createdAt: { $gt: new Date(since) }
                });
                if (newRecords > 0) needsReload = true;
            }
        }

        res.json({
            success: true,
            serverTimestamp: Date.now(),
            unreadNotificationCount: unreadCount,
            recentSuspiciousAttempts: recentSuspiciousAttempts,
            sessionStates: sessionStates,
            needsReload: needsReload
        });
    } catch (err) {
        res.json({ success: false });
    }
});

router.post("/push/subscribe", isTeacher, async function(req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const teacher = await Teacher.findById(teacherId);
        
        if (!teacher) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const subscription = req.body;
        
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: "Invalid subscription" });
        }
        
        if (!teacher.pushSubscriptions) {
            teacher.pushSubscriptions = [];
        }
        
        // Check if already subscribed
        const existing = teacher.pushSubscriptions.find(sub => sub.endpoint === subscription.endpoint);
        if (!existing) {
            teacher.pushSubscriptions.push(subscription);
            await teacher.save();
        }
        
        res.json({ success: true, message: "Push subscription saved" });
    } catch(err) {
        console.log("TEACHER PUSH SUBSCRIBE ERROR:", err.message);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
