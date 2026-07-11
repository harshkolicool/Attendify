const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const logger = require("../utils/logger");

const Student = require("../models/studentSchema");
const Teacher = require("../models/teacherSchema");

passport.use("student-local",
    new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
            try {
                const student = await Student.findOne({
                    email: email,
                    isDeleted: { $ne: true }
                });

                if (!student) {
                    return done(null, false, { message: "Student not found" });
                }

                if (student.isBlocked) {
                    return done(null, false, { message: "Student account is blocked" });
                }

                if (student.isApproved === false) {
                    return done(null, false, { message: "Your account is pending admin approval." });
                }

                const isMatch = await student.comparePassword(password);

                if (!isMatch) {
                    return done(null, false, { message: "Wrong password" });
                }

                return done(null, {
                    _id: student._id.toString(),
                    accountType: "student"
                });

            } catch (err) {
                logger.error("Student login error", { msg: err.message });
                return done(err);
            }
        }
    )
);

passport.use("teacher-local",
    new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
            try {
                const teacher = await Teacher.findOne({
                    email: email,
                    isDeleted: { $ne: true }
                });

                if (!teacher) {
                    return done(null, false, { message: "Teacher not found" });
                }

                if (teacher.isBlocked) {
                    return done(null, false, { message: "Teacher account is blocked" });
                }

                const isMatch = await teacher.comparePassword(password);

                if (!isMatch) {
                    return done(null, false, { message: "Wrong password" });
                }

                return done(null, {
                    _id: teacher._id.toString(),
                    accountType: "teacher",
                    role: teacher.role
                });

            } catch (err) {
                logger.error("Teacher login error", { msg: err.message });
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, {
        _id: (user._id || user.id).toString(),
        accountType: user.accountType,
        role: user.role
    });
});

passport.deserializeUser(async (user, done) => {
    try {
        if (user.accountType === "student") {
            const studentId = user._id;
            const student = await Student.findById(studentId).select("-password");

            if (!student || student.isDeleted || student.isBlocked) {
                return done(null, false);
            }

            const userData = student.toObject();
            userData.accountType = "student";

            return done(null, userData);
        }

        if (user.accountType === "teacher") {
            const teacherId = user._id;
            const teacher = await Teacher.findById(teacherId).select("-password");

            if (!teacher || teacher.isDeleted || teacher.isBlocked) {
                return done(null, false);
            }

            const userData = teacher.toObject();
            userData.accountType = "teacher";

            return done(null, userData);
        }

        return done(null, false);

    } catch (err) {
        return done(err);
    }
});

module.exports = passport;
