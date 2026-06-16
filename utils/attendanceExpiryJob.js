const Student = require("../models/studentSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const socketManager = require("./socketManager");
const attendanceWindow = require("./attendanceWindow");
const logger = require("./logger");

function getScheduleDateTimeForDate(timeText, baseDate) {
    if (!timeText) {
        return null;
    }

    const raw = String(timeText).trim().toUpperCase();
    const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    const referenceDate = baseDate ? new Date(baseDate) : new Date();

    let hours = 0;
    let minutes = 0;

    if (amPmMatch) {
        hours = Number(amPmMatch[1]) % 12;
        minutes = Number(amPmMatch[2]);

        if (amPmMatch[3] === "PM") {
            hours += 12;
        }
    } else {
        const parts = raw.split(":");

        if (parts.length < 2) {
            return null;
        }

        hours = Number(parts[0]);
        minutes = Number(parts[1]);
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return null;
    }

    const result = Number.isNaN(referenceDate.getTime())
        ? new Date()
        : new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
}

function getId(value) {
    if (!value) {
        return value;
    }

    return value._id ? value._id : value;
}

function sameId(a, b) {
    if (!a || !b) {
        return false;
    }

    return getId(a).toString() === getId(b).toString();
}

function getRequestLikeInfo(options) {
    return {
        userAgent: options && options.userAgent ? options.userAgent : "system-attendance-expiry-job",
        ip: options && options.ip ? options.ip : "system"
    };
}

function getDayRangeForSession(session) {
    const reference = session && (session.startTime || session.createdAt)
        ? new Date(session.startTime || session.createdAt)
        : new Date();
    const start = new Date(reference);
    const end = new Date(reference);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return {
        start,
        end
    };
}

function getClassEndTime(session) {
    if (!session) {
        return null;
    }
    return attendanceWindow.getEffectiveAttendanceEndTime(session, session.schedule);
}

function hasClassEnded(session, now) {
    const classEndTime = getClassEndTime(session);

    if (!classEndTime) {
        return true;
    }

    return now > classEndTime;
}

function buildSiblingSessionQuery(session) {
    const range = getDayRangeForSession(session);
    const query = {
        college: getId(session.college),
        teacher: getId(session.teacher),
        classGroup: getId(session.classGroup),
        startTime: {
            $gte: range.start,
            $lte: range.end
        },
        status: {
            $in: ["ACTIVE", "CLOSED", "EXPIRED"]
        }
    };

    if (session.schedule) {
        query.schedule = getId(session.schedule);
    } else {
        query.subject = getId(session.subject);
        query.classroom = getId(session.classroom);
    }

    return query;
}

function isPositiveAttendanceStatus(status) {
    return status === "PRESENT" || status === "LATE" || status === "EXCUSED";
}

async function createAbsentRecordsForMissingStudents(session, options) {
    const info = getRequestLikeInfo(options);

    const classGroupId = getId(session.classGroup);
    const subjectId = getId(session.subject);
    const classroomId = getId(session.classroom);
    const siblingSessions = await AttendanceSession.find(buildSiblingSessionQuery(session))
        .select("_id createdAt startTime")
        .sort({ createdAt: 1 });

    const siblingSessionIds = siblingSessions.length > 0
        ? siblingSessions.map(function (item) {
            return item._id;
        })
        : [session._id];

    const students = await Student.find({
        college: session.college,
        classGroup: classGroupId,
        isBlocked: { $ne: true },
        isDeleted: { $ne: true }
    }).sort({
        fullName: 1
    });

    const existingRecords = await AttendanceRecord.find({
        attendanceSession: { $in: siblingSessionIds }
    }).sort({ markedAt: 1, createdAt: 1 });

    const currentSessionRecordByStudent = {};
    const positiveRecordByStudent = {};
    const recordIds = [];
    const presentSnapshots = [];
    const absentSnapshots = [];

    for (let i = 0; i < existingRecords.length; i++) {
        const record = existingRecords[i];
        const studentId = record.student.toString();

        if (sameId(record.attendanceSession, session._id)) {
            currentSessionRecordByStudent[studentId] = record;
            recordIds.push(record._id);
        }

        if (
            isPositiveAttendanceStatus(record.status) &&
            !positiveRecordByStudent[studentId]
        ) {
            positiveRecordByStudent[studentId] = record;
        }
    }

    for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const studentId = student._id.toString();
        let record = currentSessionRecordByStudent[studentId];
        const positiveRecord = positiveRecordByStudent[studentId];

        if (!record && positiveRecord) {
            continue;
        }

        if (!record) {
            record = await AttendanceRecord.findOneAndUpdate(
                {
                    student: student._id,
                    attendanceSession: session._id
                },
                {
                    $setOnInsert: {
                        student: student._id,
                        attendanceSession: session._id,
                        subject: subjectId,
                        college: session.college,
                        classGroup: classGroupId,
                        classroom: classroomId,
                        status: "ABSENT",
                        latitude: Number(session.latitude || 0),
                        longitude: Number(session.longitude || 0),
                        distanceFromClassroom: 0,
                        verificationMethod: "AUTO_ABSENT",
                        markedBy: "SYSTEM",
                        absenceType: "AUTO_ABSENT",
                        autoAbsentAt: new Date(),
                        autoAbsentReason: "Class ended and student did not respond",
                        effectiveEndTimeUsed: getClassEndTime(session),
                        isFinalLocked: false,
                        deviceInfo: {
                            userAgent: info.userAgent,
                            ip: info.ip
                        },
                        markedAt: new Date()
                    }
                },
                {
                    new: true,
                    upsert: true,
                    setDefaultsOnInsert: true
                }
            );

            currentSessionRecordByStudent[studentId] = record;
            recordIds.push(record._id);
        }

        const snapshot = {
            student: student._id,
            fullName: student.fullName,
            enrollmentNumber: student.enrollmentNumber,
            status: isPositiveAttendanceStatus(record.status) ? record.status : "ABSENT",
            attendanceRecord: record._id,
            markedAt: record.markedAt || record.createdAt || new Date(),
            verificationMethod: record.verificationMethod || "AUTO_ABSENT",
            distanceFromClassroom: record.distanceFromClassroom || 0
        };

        if (isPositiveAttendanceStatus(snapshot.status)) {
            presentSnapshots.push(snapshot);
        } else {
            absentSnapshots.push(snapshot);
        }
    }

    session.attendanceRecords = recordIds;
    session.presentStudents = presentSnapshots;
    session.absentStudents = absentSnapshots;

    session.attendanceSummary = {
        totalPresent: presentSnapshots.length,
        totalAbsent: absentSnapshots.length,
        totalMarked: presentSnapshots.length + absentSnapshots.length
    };

    return session;
}

async function finalizeAbsencesForSession(sessionOrId, options) {
    const now = new Date();
    let session = sessionOrId;

    if (!session || !session._id) {
        session = await AttendanceSession.findById(sessionOrId)
            .populate("schedule")
            .populate("subject")
            .populate("classGroup")
            .populate("classroom");
    }

    if (!session) {
        return {
            finalized: false,
            reason: "SESSION_NOT_FOUND"
        };
    }

    if (session.absentsMarkedAt) {
        return {
            finalized: false,
            reason: "ALREADY_FINALIZED",
            session
        };
    }

    if (!hasClassEnded(session, now)) {
        return {
            finalized: false,
            reason: "CLASS_NOT_ENDED",
            session
        };
    }

    const siblingSessions = await AttendanceSession.find(buildSiblingSessionQuery(session))
        .select("_id createdAt")
        .sort({ createdAt: 1 });
    const latestSession = siblingSessions[siblingSessions.length - 1];

    if (latestSession && !sameId(latestSession._id, session._id)) {
        session.absentsMarkedAt = now;
        await session.save();

        return {
            finalized: false,
            reason: "SUPERSEDED_BY_LATER_SESSION",
            session
        };
    }

    await createAbsentRecordsForMissingStudents(session, options);

    session.absentsMarkedAt = now;
    await session.save();

    if (!options || options.emit !== false) {
        socketManager.emitAttendanceEnded(session);
    }

    return {
        finalized: true,
        reason: "FINALIZED",
        session
    };
}

async function expireOneSession(sessionId, options) {
    const session = await AttendanceSession.findById(sessionId)
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

    if (!session) {
        return {
            expired: false,
            reason: "SESSION_NOT_FOUND"
        };
    }

    if (!session.isActive || session.status !== "ACTIVE") {
        return {
            expired: false,
            reason: "SESSION_NOT_ACTIVE"
        };
    }

    const now = new Date();

    if (session.endTime > now) {
        return {
            expired: false,
            reason: "SESSION_NOT_EXPIRED"
        };
    }

    let absencesFinalized = false;

    if (hasClassEnded(session, now)) {
        const finalizeResult = await finalizeAbsencesForSession(
            session,
            Object.assign({}, options, { emit: false })
        );

        absencesFinalized = Boolean(finalizeResult.finalized);
    }

    session.isActive = false;
    session.status = "EXPIRED";
    session.closedAt = new Date();
    session.expiredAt = new Date();

    if (absencesFinalized && !session.absentsMarkedAt) {
        session.absentsMarkedAt = new Date();
    }

    await session.save();

    socketManager.emitAttendanceEnded(session);

    return {
        expired: true,
        sessionId: session._id
    };
}

async function closeExpiredAttendanceSessions() {
    const expiredSessions = await AttendanceSession.find({
        isActive: true,
        status: "ACTIVE",
        endTime: { $lte: new Date() }
    }).select("_id");

    let closedCount = 0;

    for (let i = 0; i < expiredSessions.length; i++) {
        try {
            const result = await expireOneSession(expiredSessions[i]._id, {
                userAgent: "system-attendance-expiry-job",
                ip: "system"
            });

            if (result.expired) {
                closedCount++;
            }
        } catch (err) {
            logger.error("AUTO EXPIRE SESSION ERROR", { msg: err.message, stack: err.stack });
        }
    }

    if (closedCount > 0) {
        logger.info("Auto expired attendance sessions", { count: closedCount });
    }

    const finalizedCount = await finalizePendingAbsenceSessions();

    return closedCount + finalizedCount;
}

async function finalizePendingAbsenceSessions() {
    const now = new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - 7);

    const pendingSessions = await AttendanceSession.find({
        isActive: false,
        status: { $in: ["CLOSED", "EXPIRED"] },
        startTime: { $gte: lookbackStart },
        $or: [
            { absentsMarkedAt: { $exists: false } },
            { absentsMarkedAt: null }
        ]
    })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom")
        .sort({ startTime: 1 });

    let finalizedCount = 0;

    for (let i = 0; i < pendingSessions.length; i++) {
        try {
            if (!hasClassEnded(pendingSessions[i], now)) {
                continue;
            }

            const result = await finalizeAbsencesForSession(pendingSessions[i], {
                userAgent: "system-attendance-finalizer",
                ip: "system"
            });

            if (result.finalized) {
                finalizedCount++;
            }
        } catch (err) {
            logger.error("AUTO FINALIZE ABSENCE ERROR", { msg: err.message, stack: err.stack });
        }
    }

    if (finalizedCount > 0) {
        logger.info("Auto finalized attendance absences", { count: finalizedCount });
    }

    return finalizedCount;
}

function startAttendanceExpiryJob() {
    closeExpiredAttendanceSessions().catch(function (err) {
        logger.error("INITIAL ATTENDANCE EXPIRY JOB ERROR", { msg: err.message });
    });

    setInterval(function () {
        closeExpiredAttendanceSessions().catch(function (err) {
            logger.error("ATTENDANCE EXPIRY JOB ERROR", { msg: err.message });
        });
    }, 60 * 1000);
}

module.exports = {
    startAttendanceExpiryJob,
    closeExpiredAttendanceSessions,
    finalizePendingAbsenceSessions,
    expireOneSession,
    finalizeAbsencesForSession,
    createAbsentRecordsForMissingStudents
};
