const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const Schedule = require("./models/scheduleSchema");
const AttendanceSession = require("./models/attendanceSessionSchema");

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected");

    const latestSchedule = await Schedule.findOne().sort({ createdAt: -1 }).populate('subject classGroup classroom');
    console.log("Latest Schedule:", latestSchedule);
    
    process.exit(0);
}

check().catch(console.error);
