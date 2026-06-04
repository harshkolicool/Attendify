const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;

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
                    _id: student._id,
                    id: student._id.toString(),
                    accountType: "student"
                });

            } catch (err) {
                console.log("Student login error:", err.message);
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
                    id: teacher._id,
                    accountType: "teacher",
                    role: teacher.role
                });

            } catch (err) {
                console.log("Teacher login error:", err.message);
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, {
        _id: user._id || user.id,
        id: user._id || user.id,
        accountType: user.accountType
    });
});

passport.deserializeUser(async (user, done) => {
    try {
        if (user.accountType === "student") {
            const studentId = user._id || user.id;
            const student = await Student.findById(studentId).select("-password");

            if (!student || student.isDeleted || student.isBlocked) {
                return done(null, false);
            }

            const userData = student.toObject();
            userData.accountType = "student";

            return done(null, userData);
        }

        if (user.accountType === "teacher") {
            const teacherId = user._id || user.id;
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
