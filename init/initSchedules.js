const mongoose = require("mongoose");

const Schedule = require("../models/scheduleSchema");
const College = require("../models/collegeSchema");
const ClassGroup = require("../models/classGroupSchema");
const Subject = require("../models/subjectSchema");
const Teacher = require("../models/teacherSchema");
const Classroom = require("../models/classroomSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.log(err));

const initSchedules = async () => {

    try {

        await Schedule.deleteMany({});

        const college = await College.findOne({ collegeCode: "MIT001" });
        const classGroup = await ClassGroup.findOne({ name: "CSE 4A" });
        const teacher = await Teacher.findOne({ email: "aman@college.com" });
        const classroom = await Classroom.findOne({ classroomName: "Room 101" });

        const dbms = await Subject.findOne({ subjectCode: "CS401" });
        const os = await Subject.findOne({ subjectCode: "CS402" });

        const schedules = [
            {
                college: college._id,
                classGroup: classGroup._id,
                subject: dbms._id,
                teacher: teacher._id,
                classroom: classroom._id,
                day: "Friday",
                startTime: "09:00 AM",
                endTime: "10:00 AM"
            },

            {
                college: college._id,
                classGroup: classGroup._id,
                subject: os._id,
                teacher: teacher._id,
                classroom: classroom._id,
                day: "Friday",
                startTime: "10:15 AM",
                endTime: "11:15 AM"
            },

            {
                college: college._id,
                classGroup: classGroup._id,
                subject: dbms._id,
                teacher: teacher._id,
                classroom: classroom._id,
                day: "Friday",
                startTime: "12:30 PM",
                endTime: "01:30 PM"
            }
        ];

        await Schedule.insertMany(schedules);

        console.log("Schedules inserted successfully");

        mongoose.connection.close();

    } catch (err) {
        console.log(err);
        mongoose.connection.close();
    }
};

initSchedules();