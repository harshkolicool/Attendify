const express = require("express");
const router = express.Router();
const passport = require("passport");

const College = require("../models/collegeSchema");
const ClassGroup = require("../models/classGroupSchema");
const Classroom = require("../models/classroomSchema");
const Subject = require("../models/subjectSchema");
const Teacher = require("../models/teacherSchema");
const Student = require("../models/studentSchema");
const Schedule = require("../models/scheduleSchema");

const { timeToMinutes } = require("../utils/scheduleTime");

const isCollegeAdmin = require("../middlewares/isCollegeAdmin");

function getCollegeId(req) {
    return req.user.college;
}

function getFlashMessage(code) {
    if (code === "invalid_time") {
        return "Invalid schedule time. End time must be after start time.";
    }
    if (code === "created") {
        return "Record created successfully";
    }

    if (code === "deleted") {
        return "Record deleted successfully";
    }

    if (code === "error") {
        return "Something went wrong. Please try again.";
    }

    return null;
}

router.get("/login", function (req, res) {
    if (req.isAuthenticated() && req.user.accountType === "teacher" && req.user.role === "ADMIN") {
        return res.redirect("/admin/dashboard");
    }

    res.render("admin/login", {
        error: null
    });
});

router.post("/login", function (req, res, next) {
    passport.authenticate("teacher-local", function (err, user, info) {
        if (err) {
            console.log("ADMIN LOGIN ERROR:", err.message);
            return next(err);
        }

        if (!user) {
            return res.render("admin/login", {
                error: info ? info.message : "Login failed"
            });
        }

        req.logIn(user, function (loginErr) {
            if (loginErr) {
                console.log("ADMIN LOGIN SESSION ERROR:", loginErr.message);
                return next(loginErr);
            }

            Teacher.findById(user.id).then(function (teacher) {
                if (!teacher || teacher.role !== "ADMIN") {
                    req.logout(function () {
                        return res.render("admin/login", {
                            error: "This account is not a college admin"
                        });
                    });
                    return;
                }

                res.redirect("/admin/dashboard");
            });
        });
    })(req, res, next);
});

router.get("/dashboard", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const college = await College.findById(collegeId);

        const counts = {
            classGroups: await ClassGroup.countDocuments({ college: collegeId }),
            classrooms: await Classroom.countDocuments({ college: collegeId }),
            subjects: await Subject.countDocuments({ college: collegeId }),
            teachers: await Teacher.countDocuments({ college: collegeId, role: "TEACHER" }),
            students: await Student.countDocuments({ college: collegeId }),
            schedules: await Schedule.countDocuments({ college: collegeId })
        };

        res.render("admin/dashboard", {
            admin: req.user,
            college: college,
            counts: counts,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "dashboard"
        });

    } catch (err) {
        console.log("ADMIN DASHBOARD ERROR:", err.message);
        console.log(err.stack);
        res.send("Admin dashboard error: " + err.message);
    }
});

router.get("/class-groups", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classGroups = await ClassGroup.find({ college: collegeId }).sort({ createdAt: -1 });

        res.render("admin/classGroups", {
            admin: req.user,
            classGroups: classGroups,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "class-groups"
        });

    } catch (err) {
        console.log("ADMIN CLASS GROUPS ERROR:", err.message);
        res.send("Class groups error: " + err.message);
    }
});

router.post("/class-groups/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await ClassGroup.create({
            name: req.body.name,
            department: req.body.department,
            semester: Number(req.body.semester),
            section: req.body.section,
            college: collegeId
        });

        res.redirect("/admin/class-groups?message=created");

    } catch (err) {
        console.log("ADMIN CREATE CLASS GROUP ERROR:", err.message);
        res.redirect("/admin/class-groups?message=error");
    }
});

router.post("/class-groups/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await ClassGroup.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/class-groups?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE CLASS GROUP ERROR:", err.message);
        res.redirect("/admin/class-groups?message=error");
    }
});

router.get("/classrooms", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classrooms = await Classroom.find({ college: collegeId }).sort({ createdAt: -1 });

        res.render("admin/classrooms", {
            admin: req.user,
            classrooms: classrooms,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "classrooms"
        });

    } catch (err) {
        console.log("ADMIN CLASSROOMS ERROR:", err.message);
        res.send("Classrooms error: " + err.message);
    }
});

router.post("/classrooms/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await Classroom.create({
            classroomName: req.body.classroomName,
            buildingName: req.body.buildingName,
            floorNumber: Number(req.body.floorNumber),
            latitude: Number(req.body.latitude),
            longitude: Number(req.body.longitude),
            radius: Number(req.body.radius) || 100,
            college: collegeId
        });

        res.redirect("/admin/classrooms?message=created");

    } catch (err) {
        console.log("ADMIN CREATE CLASSROOM ERROR:", err.message);
        res.redirect("/admin/classrooms?message=error");
    }
});

router.post("/classrooms/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await Classroom.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/classrooms?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE CLASSROOM ERROR:", err.message);
        res.redirect("/admin/classrooms?message=error");
    }
});

router.get("/subjects", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const subjects = await Subject.find({ college: collegeId })
            .populate("classGroup")
            .populate("teachers")
            .sort({ createdAt: -1 });

        const classGroups = await ClassGroup.find({ college: collegeId, isActive: true });
        const teachers = await Teacher.find({ college: collegeId, role: "TEACHER" });

        res.render("admin/subjects", {
            admin: req.user,
            subjects: subjects,
            classGroups: classGroups,
            teachers: teachers,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "subjects"
        });

    } catch (err) {
        console.log("ADMIN SUBJECTS ERROR:", err.message);
        res.send("Subjects error: " + err.message);
    }
});

router.post("/subjects/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        let teacherIds = req.body.teacherIds || [];

        if (!Array.isArray(teacherIds)) {
            teacherIds = [teacherIds];
        }

        const subject = await Subject.create({
            subjectName: req.body.subjectName,
            subjectCode: req.body.subjectCode,
            department: req.body.department,
            semester: Number(req.body.semester),
            classGroup: req.body.classGroupId,
            college: collegeId,
            teachers: teacherIds
        });

        for (let i = 0; i < teacherIds.length; i++) {
            await Teacher.updateOne(
                { _id: teacherIds[i], college: collegeId },
                { $addToSet: { subjects: subject._id } }
            );
        }

        await ClassGroup.updateOne(
            { _id: req.body.classGroupId, college: collegeId },
            { $addToSet: { subjects: subject._id } }
        );

        res.redirect("/admin/subjects?message=created");

    } catch (err) {
        console.log("ADMIN CREATE SUBJECT ERROR:", err.message);
        res.redirect("/admin/subjects?message=error");
    }
});

router.post("/subjects/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await Subject.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/subjects?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE SUBJECT ERROR:", err.message);
        res.redirect("/admin/subjects?message=error");
    }
});

router.get("/teachers", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const teachers = await Teacher.find({ college: collegeId })
            .populate("subjects")
            .sort({ createdAt: -1 });

        res.render("admin/teachers", {
            admin: req.user,
            teachers: teachers,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "teachers"
        });

    } catch (err) {
        console.log("ADMIN TEACHERS ERROR:", err.message);
        res.send("Teachers error: " + err.message);
    }
});

router.post("/teachers/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const role = req.body.role || "TEACHER";

        await Teacher.create({
            fullName: req.body.fullName,
            email: req.body.email,
            password: req.body.password,
            employeeId: req.body.employeeId,
            department: req.body.department,
            college: collegeId,
            role: role,
            subjects: []
        });

        res.redirect("/admin/teachers?message=created");

    } catch (err) {
        console.log("ADMIN CREATE TEACHER ERROR:", err.message);
        res.redirect("/admin/teachers?message=error");
    }
});

router.post("/teachers/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const teacher = await Teacher.findOne({
            _id: req.params.id,
            college: collegeId
        });

        if (!teacher) {
            return res.redirect("/admin/teachers?message=error");
        }

        if (teacher._id.toString() === req.user._id.toString()) {
            return res.redirect("/admin/teachers?message=error");
        }

        await Teacher.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/teachers?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE TEACHER ERROR:", err.message);
        res.redirect("/admin/teachers?message=error");
    }
});

router.get("/students", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const students = await Student.find({ college: collegeId })
            .populate("classGroup")
            .sort({ createdAt: -1 });

        const classGroups = await ClassGroup.find({ college: collegeId, isActive: true });

        res.render("admin/students", {
            admin: req.user,
            students: students,
            classGroups: classGroups,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "students"
        });

    } catch (err) {
        console.log("ADMIN STUDENTS ERROR:", err.message);
        res.send("Students error: " + err.message);
    }
});

router.post("/students/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);
        const classGroupId = req.body.classGroupId;

        const subjectsInGroup = await Subject.find({
            college: collegeId,
            classGroup: classGroupId
        });

        const subjectIds = [];

        for (let i = 0; i < subjectsInGroup.length; i++) {
            subjectIds.push(subjectsInGroup[i]._id);
        }

        const student = await Student.create({
            fullName: req.body.fullName,
            email: req.body.email,
            password: req.body.password,
            enrollmentNumber: req.body.enrollmentNumber,
            department: req.body.department,
            semester: Number(req.body.semester),
            college: collegeId,
            classGroup: classGroupId,
            subjects: subjectIds
        });

        await ClassGroup.updateOne(
            { _id: classGroupId, college: collegeId },
            { $addToSet: { students: student._id } }
        );

        res.redirect("/admin/students?message=created");

    } catch (err) {
        console.log("ADMIN CREATE STUDENT ERROR:", err.message);
        res.redirect("/admin/students?message=error");
    }
});

router.post("/students/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const student = await Student.findOne({
            _id: req.params.id,
            college: collegeId
        });

        if (student) {
            await ClassGroup.updateOne(
                { _id: student.classGroup, college: collegeId },
                { $pull: { students: student._id } }
            );
        }

        await Student.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/students?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE STUDENT ERROR:", err.message);
        res.redirect("/admin/students?message=error");
    }
});

router.get("/schedules", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const schedules = await Schedule.find({ college: collegeId })
            .populate("subject")
            .populate("teacher")
            .populate("classGroup")
            .populate("classroom")
            .sort({ day: 1, startTime: 1 });

        const classGroups = await ClassGroup.find({ college: collegeId, isActive: true });
        const subjects = await Subject.find({ college: collegeId, isActive: true }).populate("classGroup");
        const teachers = await Teacher.find({ college: collegeId, role: { $in: ["TEACHER", "HOD"] } });
        const classrooms = await Classroom.find({ college: collegeId });

        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        res.render("admin/schedules", {
            admin: req.user,
            schedules: schedules,
            classGroups: classGroups,
            subjects: subjects,
            teachers: teachers,
            classrooms: classrooms,
            days: days,
            message: getFlashMessage(req.query.message),
            error: null,
            activePage: "schedules"
        });

    } catch (err) {
        console.log("ADMIN SCHEDULES ERROR:", err.message);
        res.send("Schedules error: " + err.message);
    }
});

router.post("/schedules/create", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        const classGroupId = req.body.classGroupId;
        const subjectId = req.body.subjectId;
        const teacherId = req.body.teacherId;
        const classroomId = req.body.classroomId;
        const day = req.body.day;

        const startTime = req.body.startTime;
        const endTime = req.body.endTime;

        // ADD VALIDATION HERE
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
            return res.redirect("/admin/schedules?message=invalid_time");
        }

        // AFTER VALIDATION, CREATE SCHEDULE
        await Schedule.create({
            college: collegeId,
            classGroup: classGroupId,
            subject: subjectId,
            teacher: teacherId,
            classroom: classroomId,
            day: day,
            startTime: startTime,
            endTime: endTime
        });

        res.redirect("/admin/schedules?message=created");

    } catch (err) {
        console.log("ADMIN CREATE SCHEDULE ERROR:");
        console.log(err.message);

        res.redirect("/admin/schedules?message=error");
    }
});

router.post("/schedules/:id/delete", isCollegeAdmin, async function (req, res) {
    try {
        const collegeId = getCollegeId(req);

        await Schedule.deleteOne({
            _id: req.params.id,
            college: collegeId
        });

        res.redirect("/admin/schedules?message=deleted");

    } catch (err) {
        console.log("ADMIN DELETE SCHEDULE ERROR:", err.message);
        res.redirect("/admin/schedules?message=error");
    }
});

module.exports = router;
