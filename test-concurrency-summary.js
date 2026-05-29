const mongoose = require("mongoose");
const connectDB = require("./config/db");
const AttendanceSession = require("./models/attendanceSessionSchema");
require("dotenv").config();

async function testConcurrency() {
    await connectDB();
    const session = new AttendanceSession({
        teacher: new mongoose.Types.ObjectId(),
        subject: new mongoose.Types.ObjectId(),
        college: new mongoose.Types.ObjectId(),
        classGroup: new mongoose.Types.ObjectId(),
        classroom: new mongoose.Types.ObjectId(),
        schedule: new mongoose.Types.ObjectId(),
        endTime: new Date(Date.now() + 1000 * 60 * 60),
        presentStudents: [],
        attendanceRecords: [],
        attendanceSummary: { totalPresent: 0, totalAbsent: 0, totalMarked: 0 }
    });
    await session.save();
    console.log("Created session:", session._id);

    const promises = [];
    for (let i = 0; i < 20; i++) {
        promises.push((async () => {
            try {
                const s = await AttendanceSession.findById(session._id);
                s.presentStudents.push({
                    student: new mongoose.Types.ObjectId(),
                    fullName: "Student " + i,
                    enrollmentNumber: "EN" + i,
                    status: "PRESENT",
                    attendanceRecord: new mongoose.Types.ObjectId()
                });
                s.attendanceSummary = {
                    totalPresent: s.presentStudents.length,
                    totalAbsent: 0,
                    totalMarked: s.presentStudents.length
                };
                await s.save();
            } catch (err) {
                console.error("Save error for", i, ":", err.name);
            }
        })());
    }

    await Promise.all(promises);
    
    const finalSession = await AttendanceSession.findById(session._id);
    console.log("Total present in DB:", finalSession.presentStudents.length);
    console.log("Summary:", finalSession.attendanceSummary);
    process.exit(0);
}
testConcurrency();
