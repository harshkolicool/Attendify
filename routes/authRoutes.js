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
const College = require("../models/collegeSchema");
const socketManager = require("../utils/socketManager");

// Generate short random hex string
function generateRandomHex(length = 4) {
    return Math.random().toString(16).slice(2, 2 + length).toUpperCase();
}

function regenerateSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.regenerate(function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}

function saveSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.save(function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}

async function loginWithFreshSession(req, user) {
    await regenerateSession(req);

    await new Promise(function (resolve, reject) {
        req.logIn(user, function (err) {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });

    await saveSession(req);
}

router.get("/", (req, res) => {
    if (req.session && req.session.platformAdminId) {
        return res.redirect("/platform-admin/dashboard");
    }
    if (req.isAuthenticated()) {
        if (req.user.accountType === "student") {
            return res.redirect("/student/dashboard");
        }
        if (req.user.accountType === "teacher") {
            if (req.user.role === "ADMIN") {
                return res.redirect("/admin/dashboard");
            } else {
                return res.redirect("/teacher/dashboard");
            }
        }
    }
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
        const collegeCode = req.query.collegeCode;
        let classGroups = [];
        let college = null;
        let collegeFound = false;

        if (collegeCode) {
            college = await College.findOne({ collegeCode: collegeCode.toUpperCase(), isActive: true });
            if (college) {
                collegeFound = true;
                classGroups = await ClassGroup.find({ college: college._id, isActive: true }).select("name department semester section").lean();
            }
        }

        res.render("studentRegister", {
            error: collegeCode && !collegeFound ? "Invalid College Code." : null,
            classGroups: classGroups,
            collegeCode: collegeCode || "",
            collegeFound: collegeFound
        });
    } catch (err) {
        console.error("Register page error:", err);
        res.render("studentRegister", { error: "Failed to load registration data", classGroups: [], collegeCode: "", collegeFound: false });
    }
});

router.post("/student/register", authLimiter, async (req, res) => {
    try {
        const { fullName, email, password, classGroupId, collegeCode } = req.body;
        
        const renderError = async (msg) => {
            let classGroups = [];
            let collegeFound = false;
            if (collegeCode) {
                const college = await College.findOne({ collegeCode: collegeCode.toUpperCase(), isActive: true });
                if (college) {
                    collegeFound = true;
                    classGroups = await ClassGroup.find({ college: college._id, isActive: true }).select("name department semester section").lean();
                }
            }
            return res.render("studentRegister", { error: msg, classGroups, collegeCode: collegeCode || "", collegeFound });
        };

        if (!fullName || !email || !password || !classGroupId || !collegeCode) {
            return await renderError("All fields are required.");
        }

        const existingUser = await Student.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return await renderError("Email is already registered.");
        }

        const college = await College.findOne({
            collegeCode: collegeCode.toUpperCase(),
            isActive: true
        });

        if (!college) {
            return await renderError("Invalid college code.");
        }

        const mongoose = require("mongoose");
        if (!mongoose.Types.ObjectId.isValid(classGroupId)) {
            return await renderError("Invalid class group selected.");
        }

        const classGroup = await ClassGroup.findOne({
            _id: classGroupId,
            college: college._id,
            isActive: true
        });

        if (!classGroup) {
            return await renderError("Selected class group is invalid for this college.");
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
        
        req.session.pendingRegistrationId = newStudent._id.toString();
        res.redirect(`/student/waiting/${newStudent._id}`);
    } catch (err) {
        console.error("Registration submit error:", err);
        // Do NOT leak all class groups in catch block
        res.render("studentRegister", { error: "An error occurred during registration.", classGroups: [], collegeCode: "", collegeFound: false });
    }
});

router.get("/student/waiting/:id", async (req, res) => {
    try {
        if (req.session.pendingRegistrationId !== req.params.id) {
            return res.redirect("/student/login");
        }

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
        if (req.session.pendingRegistrationId !== req.params.id) {
            return res.json({ approved: false, error: "unauthorized" });
        }

        const student = await Student.findById(req.params.id)
            .select("isApproved")
            .lean();

        if (!student) {
            return res.json({ approved: false, error: "not_found" });
        }

        if (student.isApproved) {
            return res.json({
                approved: true,
                redirectUrl: "/student/login?approved=1"
            });
        }

        return res.json({ approved: false });
    } catch (err) {
        console.error("Check approval error:", err);
        return res.json({ approved: false, error: "server_error" });
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

        loginWithFreshSession(req, user)
            .then(function () {
                return res.redirect("/student/dashboard");
            })
            .catch(function (loginErr) {
                return next(loginErr);
            });

    })(req, res, next);
});

router.post("/teacher/login", authLimiter, (req, res, next) => {
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

        loginWithFreshSession(req, user)
            .then(function () {
                return res.redirect("/teacher/dashboard");
            })
            .catch(function (loginErr) {
                return next(loginErr);
            });

    })(req, res, next);
});

router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }

        if (!req.session) {
            return res.redirect("/");
        }

        req.session.destroy(function (destroyErr) {
            if (destroyErr) {
                return next(destroyErr);
            }

            res.clearCookie("attendance.sid");
            return res.redirect("/");
        });
    });
});

module.exports = router;
