const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

require("./models/collegeSchema");
require("./models/subjectSchema");
require("./models/classGroupSchema");
require("./models/classroomSchema");
require("./models/teacherSchema");
require("./models/studentSchema");
const Schedule = require("./models/scheduleSchema");
const AttendanceSession = require("./models/attendanceSessionSchema");
const { getTodayName } = require("./utils/scheduleTime");

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const today = getTodayName();
    const scheduleItem = await Schedule.findOne({ day: today }).populate("subject classGroup classroom");
    console.log(scheduleItem);

    if (scheduleItem) {
        console.log("Found schedule:", scheduleItem._id);
        const req = { user: { _id: scheduleItem.teacher, college: scheduleItem.college } };
        // simulate the logic
        let durationMinutes = 15;
        let finalLatitude = 12.85819;
        let finalLongitude = 77.60525;
        let finalLocationSource = "TEACHER_GPS";
        let teacherAccNum = 15;
        let teacherLocationQuality = "GOOD";
        let sessionRadius = Number(scheduleItem.classroom.radius) || 100;
        let sessionEndTime = new Date(Date.now() + durationMinutes * 60 * 1000);
        let classEndTime = new Date(Date.now() + 60 * 60 * 1000);

        try {
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
                        teacherGpsAccuracy: teacherAccNum,
                        locationSource: finalLocationSource,
                        locationMeta: null,
                        radius: sessionRadius,
                        teacherLocationQuality: teacherLocationQuality,
                        teacherLocationCapturedAt: new Date(),

                        startTime: new Date(),
                        endTime: sessionEndTime,
                        scheduledEndTime: classEndTime || sessionEndTime,
                        status: "ACTIVE",
                        isActive: true
                    }
                },
                { upsert: true, new: true, rawResult: true }
            );
            console.log("Success:", rawResult);
        } catch (e) {
            console.error("ERROR IN FIND ONE AND UPDATE:", e);
        }
    }
    
    process.exit(0);
}

check().catch(console.error);
