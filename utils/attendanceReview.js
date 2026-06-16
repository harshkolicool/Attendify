const AttendanceRecord = require("../models/attendanceRecordSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const { createNotification } = require("./notificationService");
const logger = require("./logger");

/**
 * Student requests a review of an ABSENT attendance record.
 */
async function requestAttendanceReview(studentId, recordId, reason) {
    const record = await AttendanceRecord.findOne({
        _id: recordId,
        student: studentId
    })
        .populate("attendanceSession")
        .populate("subject")
        .populate("classGroup");

    if (!record) {
        return { success: false, code: "NOT_FOUND", message: "Attendance record not found." };
    }

    if (record.isFinalLocked) {
        return { success: false, code: "LOCKED", message: "This record is locked and cannot be reviewed." };
    }

    if (record.status !== "ABSENT") {
        return { success: false, code: "NOT_ABSENT", message: "Only absent records can be reviewed." };
    }

    if (record.requestReview) {
        return { success: false, code: "ALREADY_REQUESTED", message: "Review already requested for this record." };
    }

    record.requestReview = true;
    record.reviewReason = String(reason || "").trim().slice(0, 500) || "Student requested review.";
    record.status = "PENDING_REVIEW";
    await record.save();

    // Notify the teacher who ran the session
    try {
        const session = record.attendanceSession;
        const teacherId = session && session.teacher ? session.teacher : null;
        const subjectName = record.subject ? record.subject.subjectName : "a class";

        if (teacherId) {
            await createNotification({
                recipientRole: "TEACHER",
                recipientUserId: teacherId,
                college: record.college,
                title: "Attendance Review Requested",
                message: "A student has requested a review of their absent record for " + subjectName + ".",
                category: "REVIEW",
                level: "warning",
                link: "/teacher/reviews/pending"
            });
        }
    } catch (notifErr) {
        // Non-critical — don't fail the whole request
        logger.error("REVIEW NOTIFICATION ERROR", { msg: notifErr.message });
    }

    return { success: true, message: "Review request submitted. Your teacher will be notified." };
}

/**
 * Teacher approves a review — changes status to PRESENT.
 */
async function approveAttendanceReview(teacherId, recordId, collegeId) {
    const record = await AttendanceRecord.findOne({
        _id: recordId,
        college: collegeId,
        requestReview: true,
        status: "PENDING_REVIEW"
    }).populate("attendanceSession").populate("subject");

    if (!record) {
        return { success: false, code: "NOT_FOUND", message: "Pending review record not found." };
    }

    const session = record.attendanceSession;
    if (!session || String(session.teacher) !== String(teacherId)) {
        return { success: false, code: "FORBIDDEN", message: "You are not the teacher for this session." };
    }

    record.status = "PRESENT";
    record.requestReview = false;
    record.wasAutoAbsentOverridden = true;
    record.autoAbsentOverriddenAt = new Date();
    record.overrideReason = "Teacher approved review request";
    record.approvedBy = teacherId;
    record.approvedAt = new Date();
    record.markedBy = "TEACHER";
    await record.save();

    // Update session snapshot if present
    try {
        const studentId = record.student;
        const studentIdStr = String(studentId);

        // Move from absentStudents to presentStudents in the session snapshot
        await AttendanceSession.updateOne(
            { _id: session._id },
            {
                $pull: {
                    absentStudents: { student: studentId }
                }
            }
        );

        await AttendanceSession.updateOne(
            { _id: session._id, "presentStudents.student": { $ne: studentId } },
            {
                $push: {
                    presentStudents: {
                        student: studentId,
                        status: "PRESENT",
                        attendanceRecord: record._id,
                        markedAt: new Date(),
                        verificationMethod: "TEACHER_APPROVAL",
                        distanceFromClassroom: record.distanceFromClassroom || 0
                    }
                },
                $inc: {
                    "attendanceSummary.totalPresent": 1,
                    "attendanceSummary.totalAbsent": -1
                }
            }
        );
    } catch (snapErr) {
        logger.error("REVIEW APPROVE SNAPSHOT ERROR", { msg: snapErr.message });
    }

    // Notify the student
    try {
        const subjectName = record.subject ? record.subject.subjectName : "a class";
        await createNotification({
            recipientRole: "STUDENT",
            recipientUserId: record.student,
            college: record.college,
            title: "Attendance Review Approved ✅",
            message: "Your attendance review for " + subjectName + " was approved. You are now marked Present.",
            category: "REVIEW",
            level: "success",
            link: "/student/attendance-history"
        });
    } catch (notifErr) {
        logger.error("REVIEW APPROVE STUDENT NOTIFICATION ERROR", { msg: notifErr.message });
    }

    return { success: true, message: "Review approved. Student is now marked Present." };
}

/**
 * Teacher rejects a review — keeps the ABSENT status.
 */
async function rejectAttendanceReview(teacherId, recordId, collegeId, rejectReason) {
    const record = await AttendanceRecord.findOne({
        _id: recordId,
        college: collegeId,
        requestReview: true,
        status: "PENDING_REVIEW"
    }).populate("attendanceSession").populate("subject");

    if (!record) {
        return { success: false, code: "NOT_FOUND", message: "Pending review record not found." };
    }

    const session = record.attendanceSession;
    if (!session || String(session.teacher) !== String(teacherId)) {
        return { success: false, code: "FORBIDDEN", message: "You are not the teacher for this session." };
    }

    record.status = "ABSENT";
    record.requestReview = false;
    record.overrideReason = String(rejectReason || "Teacher rejected the review request.").trim().slice(0, 500);
    await record.save();

    // Notify the student
    try {
        const subjectName = record.subject ? record.subject.subjectName : "a class";
        await createNotification({
            recipientRole: "STUDENT",
            recipientUserId: record.student,
            college: record.college,
            title: "Attendance Review Rejected",
            message: "Your attendance review for " + subjectName + " was not approved. You remain marked Absent.",
            category: "REVIEW",
            level: "warning",
            link: "/student/attendance-history"
        });
    } catch (notifErr) {
        logger.error("REVIEW REJECT STUDENT NOTIFICATION ERROR", { msg: notifErr.message });
    }

    return { success: true, message: "Review rejected. Student remains marked Absent." };
}

/**
 * Get all pending reviews for a teacher.
 */
async function getPendingReviewsForTeacher(teacherId, collegeId) {
    const sessions = await AttendanceSession.find({
        teacher: teacherId,
        college: collegeId
    }).select("_id").lean();

    const sessionIds = sessions.map(function(s) { return s._id; });

    const records = await AttendanceRecord.find({
        attendanceSession: { $in: sessionIds },
        requestReview: true,
        status: "PENDING_REVIEW",
        college: collegeId
    })
        .populate("student", "fullName enrollmentNumber")
        .populate("subject", "subjectName subjectCode")
        .populate("classGroup", "name semester section")
        .populate("classroom", "classroomName")
        .populate({
            path: "attendanceSession",
            select: "startTime endTime"
        })
        .sort({ createdAt: -1 })
        .lean();

    return records;
}

module.exports = {
    requestAttendanceReview,
    approveAttendanceReview,
    rejectAttendanceReview,
    getPendingReviewsForTeacher
};
