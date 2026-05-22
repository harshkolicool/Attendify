const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;

const Student = require("../models/studentSchema");
const Teacher = require("../models/teacherSchema");

passport.use("student-local",
    new LocalStrategy(
        { usernameField: "email" },
        async (email, password, done) => {
            try {
                const student = await Student.findOne({ email });

                if (!student) {
                    return done(null, false, { message: "Student not found" });
                }

                if (student.isBlocked) {
                    return done(null, false, { message: "Student account is blocked" });
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
                const teacher = await Teacher.findOne({ email });

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
    console.log("Serializing user:", user);
    done(null, {
        _id: user._id || user.id,
        id: user._id || user.id,
        accountType: user.accountType
    });
});

passport.deserializeUser(async (user, done) => {
    try {
        console.log("Deserializing user:", user);
        
        if (user.accountType === "student") {
            const studentId = user._id || user.id;
            console.log("Looking for student with ID:", studentId);
            
            const student = await Student.findById(studentId).select("-password");

            if (!student) {
                console.log("Student not found for ID:", studentId);
                return done(null, false);
            }

            const userData = student.toObject();
            userData.accountType = "student";
            console.log("Deserialized student successfully");

            return done(null, userData);
        }

        if (user.accountType === "teacher") {
            const teacherId = user._id || user.id;
            console.log("Looking for teacher with ID:", teacherId);
            
            const teacher = await Teacher.findById(teacherId).select("-password");

            if (!teacher) {
                console.log("Teacher not found for ID:", teacherId);
                return done(null, false);
            }

            const userData = teacher.toObject();
            userData.accountType = "teacher";
            console.log("Deserialized teacher successfully");

            return done(null, userData);
        }

        console.log("Unknown account type:", user.accountType);
        return done(null, false);

    } catch (err) {
        console.log("Deserialization error:", err.message);
        return done(err);
    }
});

module.exports = passport;