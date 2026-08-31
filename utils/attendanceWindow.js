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
        if (parts.length < 2) return null;
        hours = Number(parts[0]);
        minutes = Number(parts[1]);
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

    const result = Number.isNaN(referenceDate.getTime())
        ? new Date()
        : new Date(referenceDate);
    result.setHours(hours, minutes, 0, 0);
    return result;
}

function getEffectiveAttendanceEndTime(session, schedule) {
    if (session && session.endTime) {
        return new Date(session.endTime);
    }
    return null;
}

function isAttendanceWindowOpen(session, schedule) {
    if (!session) return { isOpen: false, reason: "NO_SESSION" };
    
    // If teacher closed it or session is no longer active / expired
    if (!session.isActive || session.status !== "ACTIVE") {
        return { isOpen: false, reason: "SESSION_NOT_ACTIVE" };
    }

    const now = new Date();
    const sessionEnd = session.endTime ? new Date(session.endTime) : null;
    
    if (sessionEnd && now > sessionEnd) {
        return { isOpen: false, reason: "WINDOW_CLOSED", effectiveEnd: sessionEnd };
    }
    
    return { isOpen: true, effectiveEnd: sessionEnd };
}

function isAutoAbsentRecord(record) {
    return record &&
        record.status === "ABSENT" &&
        record.markedBy === "SYSTEM" &&
        record.absenceType === "AUTO_ABSENT";
}

/**
 * Returns true if the student can override their ABSENT record and mark
 * attendance again. This applies to ANY absent record (auto or otherwise)
 * as long as the attendance window is currently open (teacher started/
 * reopened attendance).
 *
 * Rule:
 *   - record.status must be ABSENT
 *   - The session must be currently ACTIVE (isActive=true, status=ACTIVE)
 *   - The session must NOT have been manually closed by the teacher
 */
function canOverrideAbsent(record, session, schedule) {
    if (!record) return false;

    // Only absent records can be overridden
    if (record.status !== "ABSENT") return false;

    // Check if attendance window is open
    const window = isAttendanceWindowOpen(session, schedule);
    return window.isOpen;
}

// Legacy alias — kept for backward compatibility with code that calls this directly
function canOverrideAutoAbsent(record, session, schedule) {
    return canOverrideAbsent(record, session, schedule);
}

function getStudentAttendanceAction({ record, session, schedule }) {
    if (!record) {
        if (isAttendanceWindowOpen(session, schedule).isOpen) {
            return {
                action: "CAN_MARK",
                label: "Mark Attendance",
                reason: "Attendance is open.",
                canMark: true
            };
        }

        return {
            action: "CLOSED",
            label: "Attendance Closed",
            reason: "Attendance window is closed.",
            canMark: false
        };
    }

    if (record.status === "PRESENT" || record.status === "LATE") {
        return {
            action: "PRESENT",
            label: "Marked Present",
            reason: "Attendance already marked present.",
            canMark: false
        };
    }

    // For ANY absent record: if the session is currently open (teacher started/reopened),
    // allow the student to mark attendance again — regardless of how they got absent.
    if (record.status === "ABSENT") {
        if (canOverrideAbsent(record, session, schedule)) {
            return {
                action: "CAN_MARK_AFTER_EXTENSION",
                label: "Mark Attendance",
                reason: isAutoAbsentRecord(record)
                    ? "Class time was extended. You can mark attendance now."
                    : "Attendance has been reopened. You can mark now.",
                canMark: true
            };
        }

        return {
            action: isAutoAbsentRecord(record) ? "AUTO_ABSENT_LOCKED" : "MANUAL_ABSENT",
            label: "Marked Absent",
            reason: "Attendance window is closed.",
            canMark: false
        };
    }

    if (record.status === "PENDING_REVIEW") {
        return {
            action: "PENDING_REVIEW",
            label: "Pending Review",
            reason: "Your attendance request is waiting for teacher approval.",
            canMark: false
        };
    }

    if (record.status === "OUTSIDE_REJECTED" || record.status === "REJECTED") {
        return {
            action: "REJECTED",
            label: "Rejected",
            reason: "Your attendance request was rejected.",
            canMark: false
        };
    }

    return {
        action: "UNKNOWN",
        label: "Check Attendance",
        reason: "Attendance status needs review.",
        canMark: false
    };
}

module.exports = {
    getScheduleDateTimeForDate,
    getEffectiveAttendanceEndTime,
    isAttendanceWindowOpen,
    isAutoAbsentRecord,
    canOverrideAbsent,
    canOverrideAutoAbsent,
    getStudentAttendanceAction
};
