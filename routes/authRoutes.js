const express = require("express");
const passport = require("passport");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30, // Strict limit for auth routes
    message: "Too many attempts from this IP, please try again after a minute.",
    standardHeaders: true,
    legacyHeaders: false
});

const Student = require("../models/studentSchema");
const ClassGroup = require("../models/classGroupSchema");
const socketManager = require("../utils/socketManager");

// Generate short random hex string
function generateRandomHex(length = 4) {
    return Math.random().toString(16).slice(2, 2 + length).toUpperCase();
}

router.get("/", (req, res) => {
    res.render("home");
});

router.get("/student/login", (req, res) => {
    res.render("studentLogin", {
        error: req.query.error || null,
        message: req.query.message || null
    });
});

router.get("/student/register", async (req, res) => {
    try {
        const classGroups = await ClassGroup.find({ isActive: true }).select("name department semester section").lean();
        res.render("studentRegister", {
            error: null,
            classGroups: classGroups
        });
    } catch (err) {
        console.error("Register page error:", err);
        res.render("studentRegister", { error: "Failed to load registration data", classGroups: [] });
    }
});

router.post("/student/register", authLimiter, async (req, res) => {
    try {
        const { fullName, email, password, classGroupId } = req.body;
        
        if (!fullName || !email || !password || !classGroupId) {
            return res.render("studentRegister", { error: "All fields are required.", classGroups: await ClassGroup.find({ isActive: true }).lean() });
        }

        const existingUser = await Student.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render("studentRegister", { error: "Email is already registered.", classGroups: await ClassGroup.find({ isActive: true }).lean() });
        }

        const classGroup = await ClassGroup.findById(classGroupId);
        if (!classGroup) {
            return res.render("studentRegister", { error: "Selected class group is invalid.", classGroups: await ClassGroup.find({ isActive: true }).lean() });
        }

        // Generate enrollment number: [DEPT][SEM][SECTION]-[RANDOM]
        const deptStr = classGroup.department ? classGroup.department.substring(0, 3).toUpperCase() : "UNK";
        const semStr = classGroup.semester || "0";
        const secStr = classGroup.section || "0";
        const randomStr = generateRandomHex(4);
        
        const enrollmentNumber = `${deptStr}${semStr}${secStr}-${randomStr}`;

        const newStudent = new Student({
            fullName,
            email,
            password,
            enrollmentNumber,
            department: classGroup.department,
            semester: classGroup.semester,
            classGroup: classGroup._id,
            college: classGroup.college,
            isApproved: false // Admin must approve
        });

        await newStudent.save();
        
        socketManager.emitNewRegistration(classGroup.college, newStudent);
        
        res.redirect(`/student/waiting/${newStudent._id}`);
    } catch (err) {
        console.error("Registration submit error:", err);
        res.render("studentRegister", { error: "An error occurred during registration.", classGroups: await ClassGroup.find({ isActive: true }).lean() });
    }
});

router.get("/student/waiting/:id", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.redirect("/student/login");
        }
        
        if (student.isApproved) {
            return res.redirect("/student/login?message=approved");
        }

        res.render("studentWaiting", { student });
    } catch (err) {
        console.error("Waiting room error:", err);
        res.redirect("/student/login");
    }
});

// Lightweight JSON endpoint for the waiting page to poll
router.get("/student/check-approval/:id", async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .select("isApproved autoLoginToken")
            .lean();

        if (!student) {
            return res.json({ approved: false, error: "not_found" });
        }

        if (student.isApproved) {
            return res.json({
                approved: true,
                token: student.autoLoginToken || null
            });
        }

        return res.json({ approved: false });
    } catch (err) {
        console.error("Check approval error:", err);
        return res.json({ approved: false, error: "server_error" });
    }
});

router.get("/student/auto-login", async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.redirect("/student/login?error=invalid_token");
        }

        const student = await Student.findOne({ autoLoginToken: token });
        if (!student) {
            return res.redirect("/student/login?error=invalid_token");
        }

        // Clear the one-time token
        student.autoLoginToken = null;
        await student.save();

        // Log the user in
        const userObj = {
            _id: student._id,
            id: student._id.toString(),
            accountType: "student"
        };
        
        req.login(userObj, (err) => {
            if (err) {
                console.error("Auto login error:", err);
                return res.redirect("/student/login?error=login_failed");
            }
            
            // Force save the session before redirecting to prevent race condition
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error("Session save error during auto-login:", saveErr);
                }
                res.redirect("/student/dashboard");
            });
        });
    } catch (err) {
        console.error("Auto login system error:", err);
        res.redirect("/student/login?error=system_error");
    }
});

router.get("/teacher/login", (req, res) => {
    res.render("teacherLogin", {
        error: null
    });
});

router.post("/student/login", authLimiter, (req, res, next) => {
    passport.authenticate("student-local", (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.render("studentLogin", {
                error: info ? info.message : "Login failed"
            });
        }

        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            return res.redirect("/student/dashboard");
        });

    })(req, res, next);
});

router.post("/teacher/login", (req, res, next) => {
    passport.authenticate("teacher-local", (err, user, info) => {
        if (err) {
            return next(err);
        }

        if (!user) {
            return res.render("teacherLogin", {
                error: info.message
            });
        }

        if (user.role === "ADMIN") {
            return res.render("teacherLogin", {
                error: "This is an admin account. Please login from admin page."
            });
        }

        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }

            return res.redirect("/teacher/dashboard");
        });

    })(req, res, next);
});

router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }

        res.redirect("/");
    });
});

module.exports = router;