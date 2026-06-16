const Schedule = require("../models/scheduleSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const { createNotification } = require("./notificationService");
const { getTodayName } = require("./scheduleTime");
const logger = require("./logger");

/**
 * Checks if a time string (e.g., "10:30 AM") is between `startMinutesAgo` and `endMinutesAgo`.
 */
function isTimeWithinRecentWindow(timeStr, startMinutesAgo, endMinutesAgo) {
    if (!timeStr) return false;

    const match = timeStr.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!match) return false;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const meridian = match[3];

    if (meridian === "PM" && hours !== 12) hours += 12;
    if (meridian === "AM" && hours === 12) hours = 0;

    const scheduleMinutes = (hours * 60) + minutes;
    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();

    const diff = nowMinutes - scheduleMinutes;
    return diff >= startMinutesAgo && diff <= endMinutesAgo;
}

async function checkTeacherReminders() {
    try {
        const todayDay = getTodayName();
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);

        // 1. Find all schedules for today
        const todaySchedules = await Schedule.find({
            day: todayDay,
            isActive: true
        }).populate("teacher", "fullName _id")
          .populate("subject", "subjectName");

        // Filter schedules that started 5-20 minutes ago
        const recentSchedules = todaySchedules.filter(s => isTimeWithinRecentWindow(s.startTime, 5, 20));

        if (recentSchedules.length === 0) return;

        // 2. Check if an AttendanceSession exists for these schedules today
        for (const schedule of recentSchedules) {
            const sessionExists = await AttendanceSession.findOne({
                schedule: schedule._id,
                startTime: { $gte: startOfToday, $lte: endOfToday }
            });

            if (!sessionExists) {
                // Prevent duplicate notifications by checking if one was already sent today
                // For simplicity in MVP, we just use the notificationService which doesn't deduplicate natively,
                // but we will send it anyway or we can add a check if needed.
                // In a production app we'd add a "reminderSentAt" field.
                
                await createNotification({
                    user: schedule.teacher._id,
                    title: "Class Started",
                    message: `You haven't started attendance for ${schedule.subject.subjectName} yet.`,
                    type: "SYSTEM",
                    link: "/teacher/dashboard"
                });
                
                logger.info("Sent class start reminder", { teacherId: schedule.teacher._id, scheduleId: schedule._id });
            }
        }

    } catch (err) {
        logger.error("TEACHER REMINDER ERROR", { msg: err.message });
    }
}

function startTeacherRemindersJob() {
    // Run every 5 minutes
    setInterval(checkTeacherReminders, 5 * 60 * 1000);
}

module.exports = { startTeacherRemindersJob };
