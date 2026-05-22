const express = require("express");
const router = express.Router();

const Student = require("../models/studentSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const Schedule = require("../models/scheduleSchema");

const getDistanceInMeters = require("../utils/geoDistance");

function isStudent(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect("/student/login");
    }

    if (req.user.accountType !== "student") {
        return res.redirect("/");
    }

    next();
}

router.get("/dashboard", isStudent, async (req, res) => {
    try {
        console.log("Student dashboard route hit");
        console.log("Logged in user:", req.user);

        if (!req.user || !req.user._id) {
            console.log("User object invalid");
            return res.send("User session invalid. Please login again.");
        }

        const student = await Student.findById(req.user._id)
        .populate("classGroup")
            .populate("subjects");

        console.log("Student from DB:", student);

        if (!student) {
            console.log("Student not found in database");
            return res.send("Student not found");
        }

        if (!student.classGroup) {
            console.log("Student classGroup missing");
            return res.send("Student classGroup missing. Run initAll.js again.");
        }

        if (!student.college) {
            console.log("Student college missing");
            return res.send("Student college missing. Please contact admin.");
        }

        const days = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        const today = days[new Date().getDay()];

        const schedules = await Schedule.find({
            college: student.college,
            classGroup: student.classGroup._id,
            day: today
        })
        .populate("subject")
        .populate("teacher")
        .populate("classroom")
        .catch(err => {
            console.log("Error fetching schedules:", err.message);
            return [];
        });

        console.log("Schedules:", schedules);

        const activeSessions = await AttendanceSession.find({
            college: student.college,
            classGroup: student.classGroup._id,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: new Date() }
        })
        .populate("subject")
        .populate("classroom")
        .populate("teacher")
        .populate("classGroup")
        .catch(err => {
            console.log("Error fetching active sessions:", err.message);
            return [];
        });

        console.log("Active Sessions:", activeSessions);

        const markedRecords = await AttendanceRecord.find({
            student: student._id
        })
        .catch(err => {
            console.log("Error fetching marked records:", err.message);
            return [];
        });

        const markedSessionIds = [];

        for (let record of markedRecords) {
            markedSessionIds.push(record.attendanceSession.toString());
        }

        res.render("studentDashboard", {
            student: student,
            activeSessions: activeSessions || [],
            markedSessionIds: markedSessionIds || [],
            schedules: schedules || [],
            today: today
        });

    } catch (err) {
        console.log("STUDENT DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Student dashboard error: " + err.message);
    }
});

router.get("/schedule", isStudent, async (req, res) => {
    try {
        const student = await Student.findById(req.user._id)
            .populate("classGroup")
            .populate("subjects");

        if (!student) {
            return res.redirect("/student/login");
        }

        if (!student.classGroup) {
            return res.send("Student classGroup missing. Run initAll.js again.");
        }

        const days = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        const today = days[new Date().getDay()];

        const schedules = await Schedule.find({
            college: student.college,
            classGroup: student.classGroup._id,
            day: today
        })
        .populate("subject")
        .populate("teacher")
        .populate("classroom");

        const activeSessions = await AttendanceSession.find({
            college: student.college,
            classGroup: student.classGroup._id,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: new Date() }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classroom")
        .populate("teacher")
        .populate("classGroup");

        const markedRecords = await AttendanceRecord.find({
            student: student._id
        });

        const markedSessionIds = [];

        for (let record of markedRecords) {
            markedSessionIds.push(record.attendanceSession.toString());
        }

        res.render("studentSchedule", {
            student: student,
            schedules: schedules || [],
            activeSessions: activeSessions || [],
            markedSessionIds: markedSessionIds || [],
            today: today
        });

    } catch (err) {
        console.log("STUDENT SCHEDULE ERROR:");
        console.log(err.message);
        console.log(err);

        res.send("Student schedule error: " + err.message);
    }
});

router.post("/attendance/mark", isStudent, async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;

        if (
            !sessionId ||
            latitude === undefined || latitude === null ||
            longitude === undefined || longitude === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Location is required"
            });
        }

        const student = await Student.findById(req.user._id);

        if (!student) {
            return res.status(401).json({
                success: false,
                message: "Student not found"
            });
        }

        const session = await AttendanceSession.findById(sessionId)
            .populate("schedule")
            .populate("classroom")
            .populate("subject")
            .populate("classGroup");

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Attendance session not found"
            });
        }

        if (!session.isActive || session.status !== "ACTIVE") {
            return res.status(400).json({
                success: false,
                message: "Attendance session is closed"
            });
        }

        if (session.endTime < new Date()) {
            session.isActive = false;
            session.status = "EXPIRED";
            await session.save();

            return res.status(400).json({
                success: false,
                message: "Attendance session expired"
            });
        }

        if (session.college.toString() !== student.college.toString()) {
            return res.status(403).json({
                success: false,
                message: "Invalid college"
            });
        }

        const sessionClassGroupId = session.classGroup._id
            ? session.classGroup._id.toString()
            : session.classGroup.toString();

        const studentClassGroupId = student.classGroup.toString();

        if (sessionClassGroupId !== studentClassGroupId) {
            return res.status(403).json({
                success: false,
                message: "This attendance is not for your class"
            });
        }

        const alreadyMarked = await AttendanceRecord.findOne({
            student: student._id,
            attendanceSession: session._id
        });

        if (alreadyMarked) {
            return res.status(400).json({
                success: false,
                message: "Attendance already marked"
            });
        }

        const sessionLatitude = session.latitude || session.classroom.latitude;
        const sessionLongitude = session.longitude || session.classroom.longitude;
        const sessionRadius = session.radius || session.classroom.radius;

        if (sessionLatitude == null || sessionLongitude == null) {
            return res.status(400).json({
                success: false,
                message: "Attendance location is missing"
            });
        }

        const distance = getDistanceInMeters(
            Number(latitude),
            Number(longitude),
            Number(sessionLatitude),
            Number(sessionLongitude)
        );

        if (distance > sessionRadius) {
            return res.status(403).json({
                success: false,
                message: "You are outside the classroom range",
                distance: Math.round(distance),
                allowedRadius: sessionRadius
            });
        }

        const attendanceRecord = await AttendanceRecord.create({
            student: student._id,
            attendanceSession: session._id,
            subject: session.subject._id,
            college: session.college,
            classGroup: session.classGroup._id,
            classroom: session.classroom._id,
            status: "PRESENT",
            latitude: Number(latitude),
            longitude: Number(longitude),
            distanceFromClassroom: Math.round(distance),
            verificationMethod: "GEOLOCATION",
            deviceInfo: {
                userAgent: req.headers["user-agent"],
                ip: req.ip
            }
        });

        session.attendanceRecords.push(attendanceRecord._id);
        await session.save();

        res.json({
            success: true,
            message: "Attendance marked successfully"
        });

    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Attendance already marked"
            });
        }

        console.log("MARK ATTENDANCE ERROR:", err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Mark attendance error: " + err.message
        });
    }
});

module.exports = router;