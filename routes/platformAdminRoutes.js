const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    message: "Too many attempts from this IP, please try again after a minute.",
    standardHeaders: true,
    legacyHeaders: false
});

const router = express.Router();

const bcrypt = require("bcrypt");
const crypto = require("crypto");

const PlatformAdmin = require("../models/platformAdminSchema");
const CollegeRegistrationRequest = require("../models/collegeRegistrationRequestSchema");
const College = require("../models/collegeSchema");
const Teacher = require("../models/teacherSchema");
const isPlatformAdmin = require("../middlewares/isPlatformAdmin");
const {
    getUnreadCount,
    getRecentNotifications,
    markAllRead,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications
} = require("../utils/notificationService");
const socketManager = require("../utils/socketManager");

function cleanText(value) {
    if (!value) {
        return "";
    }

    return value.toString().trim();
}

function cleanEmail(value) {
    return cleanText(value).toLowerCase();
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getExactRegex(value) {
    return new RegExp("^" + escapeRegex(value) + "$", "i");
}

function getLoginMessage(code) {
    if (code === "invalid") {
        return "Invalid email or password.";
    }

    if (code === "blocked") {
        return "Your platform admin account is blocked.";
    }

    if (code === "logout") {
        return "Logged out successfully.";
    }

    return null;
}

function getFlash(req) {
    const flash = req.session.platformFlash || null;
    req.session.platformFlash = null;
    return flash;
}

function setFlash(req, type, title, message, extra) {
    req.session.platformFlash = {
        type: type,
        title: title,
        message: message,
        extra: extra || null
    };
}

const COMMON_COLLEGE_WORDS = [
    "COLLEGE",
    "UNIVERSITY",
    "INSTITUTE",
    "SCHOOL",
    "OF",
    "THE",
    "AND",
    "FOR",
    "ENGINEERING",
    "TECHNOLOGY",
    "SCIENCE",
    "SCIENCES",
    "ARTS",
    "COMMERCE",
    "MANAGEMENT"
];

function getCollegeBaseCode(collegeName) {
    const words = cleanText(collegeName)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "COL";
    }

    const firstWord = words[0];

    if (
        firstWord.length >= 2 &&
        firstWord.length <= 5 &&
        !COMMON_COLLEGE_WORDS.includes(firstWord)
    ) {
        return firstWord;
    }

    const meaningfulWords = words.filter(function (word) {
        return !COMMON_COLLEGE_WORDS.includes(word);
    });

    const acronym = meaningfulWords.map(function (word) {
        return word[0];
    }).join("");

    if (acronym.length >= 3) {
        return acronym.slice(0, 5);
    }

    const firstMeaningfulWord = meaningfulWords[0];

    if (firstMeaningfulWord) {
        return firstMeaningfulWord.slice(0, 5);
    }

    return words[0].slice(0, 5);
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function getPlatformNotificationFilter() {
    return {
        recipientRole: "PLATFORM_ADMIN"
    };
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

async function generateCollegeCode(collegeName) {
    const baseCode = getCollegeBaseCode(collegeName);

    for (let number = 1; number <= 999; number++) {
        const paddedNumber = number.toString().padStart(3, "0");
        const candidateCode = baseCode + paddedNumber;

        const existingCollege = await College.findOne({
            collegeCode: candidateCode
        });

        if (!existingCollege) {
            return candidateCode;
        }
    }

    throw new Error("Unable to generate college code");
}

async function generateAdminEmployeeId(collegeId, collegeCode) {
    for (let number = 1; number <= 999; number++) {
        const paddedNumber = number.toString().padStart(3, "0");
        const candidateEmployeeId = collegeCode + "-ADM-" + paddedNumber;

        const existingTeacher = await Teacher.findOne({
            college: collegeId,
            employeeId: candidateEmployeeId
        });

        if (!existingTeacher) {
            return candidateEmployeeId;
        }
    }

    throw new Error("Unable to generate admin employee ID");
}

function generateApprovalTemporaryPassword(collegeCode) {
    const randomPart = crypto.randomBytes(3).toString("base64url").slice(0, 4).toUpperCase();
    return collegeCode + "@Admin" + randomPart;
}

function generateResetTemporaryPassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "@#$%";

    const all = upper + lower + numbers + symbols;

    let password = "";

    password += upper[crypto.randomInt(0, upper.length)];
    password += lower[crypto.randomInt(0, lower.length)];
    password += numbers[crypto.randomInt(0, numbers.length)];
    password += symbols[crypto.randomInt(0, symbols.length)];

    for (let i = password.length; i < 12; i++) {
        password += all[crypto.randomInt(0, all.length)];
    }

    const chars = password.split("");

    for (let i = chars.length - 1; i > 0; i--) {
        const swapIndex = crypto.randomInt(0, i + 1);
        const tmp = chars[i];
        chars[i] = chars[swapIndex];
        chars[swapIndex] = tmp;
    }

    return chars.join("");
}

async function resetCollegeAdminPassword(req, collegeAdmin, collegeName) {
    const temporaryPassword = generateResetTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    await Teacher.updateOne(
        {
            _id: collegeAdmin._id,
            role: "ADMIN"
        },
        {
            $set: {
                password: hashedPassword
            }
        }
    );

    req.session.resetAdminPasswordResult = {
        collegeName: collegeName || "College",
        adminName: collegeAdmin.fullName,
        adminEmail: collegeAdmin.email,
        temporaryPassword: temporaryPassword
    };

    setFlash(
        req,
        "success",
        "Password Reset Successfully",
        "A new temporary password was generated. It is shown below once."
    );
}

router.get("/platform-admin", function (req, res) {
    if (req.session && req.session.platformAdminId) {
        return res.redirect("/platform-admin/dashboard");
    }

    res.redirect("/platform-admin/login");
});

router.get("/platform-admin/login", function (req, res) {
    res.render("platformAdmin/login", {
        message: getLoginMessage(req.query.message)
    });
});

router.post("/platform-admin/login", authLimiter, async function (req, res) {
    try {
        const email = cleanEmail(req.body.email);
        const password = cleanText(req.body.password);

        if (!email || !password) {
            return res.redirect("/platform-admin/login?message=invalid");
        }

        const platformAdmin = await PlatformAdmin.findOne({
            email: email
        });

        if (!platformAdmin) {
            return res.redirect("/platform-admin/login?message=invalid");
        }

        if (platformAdmin.isBlocked) {
            return res.redirect("/platform-admin/login?message=blocked");
        }

        const isPasswordCorrect = await platformAdmin.comparePassword(password);

        if (!isPasswordCorrect) {
            return res.redirect("/platform-admin/login?message=invalid");
        }

        platformAdmin.lastLogin = new Date();
        await platformAdmin.save();

        await regenerateSession(req);
        req.session.platformAdminId = platformAdmin._id.toString();
        await saveSession(req);

        res.redirect("/platform-admin/dashboard");

    } catch (err) {
        console.log("PLATFORM ADMIN LOGIN ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/platform-admin/login?message=invalid");
    }
});

router.post("/platform-admin/logout", function (req, res) {
    if (!req.session) {
        return res.redirect("/platform-admin/login?message=logout");
    }

    req.session.destroy(function () {
        res.clearCookie("attendance.sid");
        res.redirect("/platform-admin/login?message=logout");
    });
});

router.get("/platform-admin/dashboard", isPlatformAdmin, async function (req, res) {
    try {
        const pendingRequestsCount = await CollegeRegistrationRequest.countDocuments({
            status: "PENDING"
        });

        const approvedRequestsCount = await CollegeRegistrationRequest.countDocuments({
            status: "APPROVED"
        });

        const rejectedRequestsCount = await CollegeRegistrationRequest.countDocuments({
            status: "REJECTED"
        });

        const collegesCount = await College.countDocuments();

        const recentRequests = await CollegeRegistrationRequest.find()
            .populate("createdCollege")
            .populate("createdAdmin")
            .sort({ createdAt: -1 })
            .limit(8);

        const resetAdminPasswordResult = req.session.resetAdminPasswordResult || null;
        req.session.resetAdminPasswordResult = null;

        res.render("platformAdmin/dashboard", {
            activePage: "dashboard",
            flash: getFlash(req),
            pendingRequestsCount: pendingRequestsCount,
            approvedRequestsCount: approvedRequestsCount,
            rejectedRequestsCount: rejectedRequestsCount,
            collegesCount: collegesCount,
            recentRequests: recentRequests,
            resetAdminPasswordResult: resetAdminPasswordResult
        });

    } catch (err) {
        console.log("PLATFORM ADMIN DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Dashboard error: " + "An internal server error occurred.");
    }
});

router.get("/platform-admin/notifications", isPlatformAdmin, async function (req, res) {
    try {
        const notifications = await getRecentNotifications(
            getPlatformNotificationFilter(),
            120
        );

        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        res.render("platformAdmin/notifications", {
            activePage: "notifications",
            platformAdmin: req.platformAdmin,
            notifications: notifications,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.log("PLATFORM ADMIN NOTIFICATIONS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Platform notifications error: " + "An internal server error occurred.");
    }
});

router.post("/platform-admin/notifications/mark-all-read", isPlatformAdmin, async function (req, res) {
    try {
        await markAllRead(getPlatformNotificationFilter());

        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        socketManager.emitNotificationUnreadCount({
            recipientRole: "PLATFORM_ADMIN",
            unreadCount: unreadCount
        });

        res.redirect("/platform-admin/notifications");
    } catch (err) {
        console.log("PLATFORM ADMIN MARK ALL READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/platform-admin/notifications");
    }
});

router.post("/platform-admin/notifications/clear-all", isPlatformAdmin, async function (req, res) {
    try {
        await clearAllNotifications(getPlatformNotificationFilter());

        socketManager.emitNotificationUnreadCount({
            recipientRole: "PLATFORM_ADMIN",
            unreadCount: 0
        });

        res.redirect("/platform-admin/notifications");
    } catch (err) {
        console.log("PLATFORM ADMIN CLEAR ALL NOTIFICATIONS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/platform-admin/notifications");
    }
});

router.post("/platform-admin/notifications/:id/read", isPlatformAdmin, async function (req, res) {
    try {
        await markNotificationRead(req.params.id, getPlatformNotificationFilter());

        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        socketManager.emitNotificationUnreadCount({
            recipientRole: "PLATFORM_ADMIN",
            unreadCount: unreadCount
        });

        res.redirect("/platform-admin/notifications");
    } catch (err) {
        console.log("PLATFORM ADMIN MARK NOTIFICATION READ ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/platform-admin/notifications");
    }
});

router.post("/platform-admin/notifications/:id/delete", isPlatformAdmin, async function (req, res) {
    try {
        await deleteNotification(req.params.id, getPlatformNotificationFilter());

        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        socketManager.emitNotificationUnreadCount({
            recipientRole: "PLATFORM_ADMIN",
            unreadCount: unreadCount
        });

        res.redirect("/platform-admin/notifications");
    } catch (err) {
        console.log("PLATFORM ADMIN DELETE NOTIFICATION ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/platform-admin/notifications");
    }
});

router.get("/platform-admin/notifications/unread-count", isPlatformAdmin, async function (req, res) {
    try {
        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        res.json({
            success: true,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.log("PLATFORM ADMIN UNREAD NOTIFICATION COUNT ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Unable to load unread notification count."
        });
    }
});

router.get("/platform-admin/requests", isPlatformAdmin, async function (req, res) {
    try {
        const status = cleanText(req.query.status).toUpperCase();

        const filter = {};

        if (["PENDING", "APPROVED", "REJECTED"].includes(status)) {
            filter.status = status;
        }

        const requests = await CollegeRegistrationRequest.find(filter)
            .populate("createdCollege")
            .populate("createdAdmin")
            .populate("reviewedBy")
            .sort({ createdAt: -1 });

        res.render("platformAdmin/requests", {
            activePage: "requests",
            selectedStatus: status || "ALL",
            flash: getFlash(req),
            requests: requests
        });

    } catch (err) {
        console.log("PLATFORM ADMIN REQUESTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Requests error: " + "An internal server error occurred.");
    }
});

router.post("/platform-admin/requests/:id/approve", isPlatformAdmin, async function (req, res) {
    try {
        const requestId = req.params.id;

        if (!isValidObjectId(requestId)) {
            setFlash(
                req,
                "error",
                "Invalid Request",
                "The selected registration request is invalid."
            );

            return res.redirect("/platform-admin/requests?status=PENDING");
        }

        const registrationRequest = await CollegeRegistrationRequest.findOne({
            _id: requestId,
            status: "PENDING"
        });

        if (!registrationRequest) {
            setFlash(
                req,
                "error",
                "Request Not Found",
                "This request may already be approved or rejected."
            );

            return res.redirect("/platform-admin/requests");
        }

        const existingCollege = await College.findOne({
            collegeName: getExactRegex(registrationRequest.collegeName),
            city: getExactRegex(registrationRequest.city),
            state: getExactRegex(registrationRequest.state)
        });

        if (existingCollege) {
            setFlash(
                req,
                "error",
                "Duplicate College",
                "A college with the same name, city and state already exists."
            );

            return res.redirect("/platform-admin/requests?status=PENDING");
        }

        const existingAdmin = await Teacher.findOne({
            email: registrationRequest.adminEmail
        });

        if (existingAdmin) {
            setFlash(
                req,
                "error",
                "Duplicate Admin Email",
                "A teacher/admin account with this email already exists."
            );

            return res.redirect("/platform-admin/requests?status=PENDING");
        }

        const generatedCollegeCode = await generateCollegeCode(
            registrationRequest.collegeName
        );

        const createdCollege = await College.create({
            collegeName: registrationRequest.collegeName,
            collegeCode: generatedCollegeCode,
            address: registrationRequest.address,
            city: registrationRequest.city,
            state: registrationRequest.state,
            isActive: true,
            classrooms: [],
            students: [],
            teachers: []
        });

        const generatedAdminEmployeeId = await generateAdminEmployeeId(
            createdCollege._id,
            generatedCollegeCode
        );

        const temporaryPassword = generateApprovalTemporaryPassword(generatedCollegeCode);

        let createdAdmin = null;

        try {
            createdAdmin = await Teacher.create({
                fullName: registrationRequest.adminFullName,
                email: registrationRequest.adminEmail,
                password: temporaryPassword,
                employeeId: generatedAdminEmployeeId,
                department: "ADMINISTRATION",
                college: createdCollege._id,
                subjects: [],
                attendanceSessions: [],
                role: "ADMIN",
                isBlocked: false
            });

            await College.updateOne(
                {
                    _id: createdCollege._id
                },
                {
                    $addToSet: {
                        teachers: createdAdmin._id
                    }
                }
            );

            registrationRequest.status = "APPROVED";
            registrationRequest.generatedCollegeCode = generatedCollegeCode;
            registrationRequest.generatedAdminEmployeeId = generatedAdminEmployeeId;
            registrationRequest.createdCollege = createdCollege._id;
            registrationRequest.createdAdmin = createdAdmin._id;
            registrationRequest.reviewedBy = req.platformAdmin._id;
            registrationRequest.reviewedAt = new Date();

            await registrationRequest.save();

        } catch (innerErr) {
            await College.deleteOne({
                _id: createdCollege._id
            });

            throw innerErr;
        }

        setFlash(
            req,
            "success",
            "College Approved",
            "College and first admin were created successfully.",
            {
                collegeName: createdCollege.collegeName,
                collegeCode: generatedCollegeCode,
                adminEmail: createdAdmin.email,
                adminEmployeeId: generatedAdminEmployeeId,
                temporaryPassword: temporaryPassword
            }
        );

        res.redirect("/platform-admin/requests?status=PENDING");

    } catch (err) {
        console.log("PLATFORM ADMIN APPROVE REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        setFlash(
            req,
            "error",
            "Approval Failed",
            "Approval failed. Please try again."
        );

        res.redirect("/platform-admin/requests?status=PENDING");
    }
});

router.post("/platform-admin/requests/:id/reject", isPlatformAdmin, async function (req, res) {
    try {
        const requestId = req.params.id;
        const rejectionReason = cleanText(req.body.rejectionReason);

        if (!isValidObjectId(requestId)) {
            setFlash(
                req,
                "error",
                "Invalid Request",
                "The selected registration request is invalid."
            );

            return res.redirect("/platform-admin/requests?status=PENDING");
        }

        const registrationRequest = await CollegeRegistrationRequest.findOne({
            _id: requestId,
            status: "PENDING"
        });

        if (!registrationRequest) {
            setFlash(
                req,
                "error",
                "Request Not Found",
                "This request may already be approved or rejected."
            );

            return res.redirect("/platform-admin/requests");
        }

        registrationRequest.status = "REJECTED";
        registrationRequest.rejectionReason = rejectionReason || "Request rejected by platform admin.";
        registrationRequest.reviewedBy = req.platformAdmin._id;
        registrationRequest.reviewedAt = new Date();

        await registrationRequest.save();

        setFlash(
            req,
            "success",
            "Request Rejected",
            "College registration request was rejected."
        );

        res.redirect("/platform-admin/requests?status=PENDING");

    } catch (err) {
        console.log("PLATFORM ADMIN REJECT REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        setFlash(
            req,
            "error",
            "Reject Failed",
            "Reject action failed. Please try again."
        );

        res.redirect("/platform-admin/requests?status=PENDING");
    }
});

router.post("/platform-admin/requests/:id/reset-admin-password", isPlatformAdmin, async function (req, res) {
    try {
        const requestId = req.params.id;

        if (!isValidObjectId(requestId)) {
            setFlash(
                req,
                "error",
                "Invalid Request",
                "Invalid request selected."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        const registrationRequest = await CollegeRegistrationRequest.findById(requestId)
            .populate("createdCollege")
            .populate("createdAdmin");

        if (!registrationRequest) {
            setFlash(
                req,
                "error",
                "Request Not Found",
                "College registration request not found."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        if (registrationRequest.status !== "APPROVED") {
            setFlash(
                req,
                "error",
                "Reset Not Allowed",
                "Admin password can be reset only for approved colleges."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        let collegeAdmin = null;

        if (registrationRequest.createdAdmin) {
            const createdAdminId = registrationRequest.createdAdmin._id
                ? registrationRequest.createdAdmin._id
                : registrationRequest.createdAdmin;

            collegeAdmin = await Teacher.findOne({
                _id: createdAdminId,
                role: "ADMIN"
            });
        }

        if (!collegeAdmin) {
            collegeAdmin = await Teacher.findOne({
                email: registrationRequest.adminEmail,
                role: "ADMIN"
            });
        }

        if (!collegeAdmin) {
            setFlash(
                req,
                "error",
                "Admin Not Found",
                "College admin account was not found."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        await resetCollegeAdminPassword(
            req,
            collegeAdmin,
            registrationRequest.collegeName
        );

        res.redirect("/platform-admin/dashboard");

    } catch (err) {
        console.log("PLATFORM ADMIN RESET ADMIN PASSWORD BY REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        setFlash(
            req,
            "error",
            "Reset Failed",
            "Password reset failed. Please try again."
        );

        res.redirect("/platform-admin/dashboard");
    }
});

router.post("/platform-admin/colleges/:collegeId/reset-admin-password", isPlatformAdmin, async function (req, res) {
    try {
        const collegeId = req.params.collegeId;

        if (!isValidObjectId(collegeId)) {
            setFlash(
                req,
                "error",
                "Invalid College",
                "Invalid college selected."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        const college = await College.findById(collegeId);

        if (!college) {
            setFlash(
                req,
                "error",
                "College Not Found",
                "College was not found."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        const collegeAdmin = await Teacher.findOne({
            college: college._id,
            role: "ADMIN"
        });

        if (!collegeAdmin) {
            setFlash(
                req,
                "error",
                "Admin Not Found",
                "College admin account was not found."
            );

            return res.redirect("/platform-admin/dashboard");
        }

        await resetCollegeAdminPassword(
            req,
            collegeAdmin,
            college.collegeName
        );

        res.redirect("/platform-admin/dashboard");

    } catch (err) {
        console.log("PLATFORM ADMIN RESET ADMIN PASSWORD BY COLLEGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        setFlash(
            req,
            "error",
            "Reset Failed",
            "Password reset failed. Please try again."
        );

        res.redirect("/platform-admin/dashboard");
    }
});

// ── REALTIME POLLING FALLBACK ────────────────────────────────────────────────
router.get("/realtime/poll", isPlatformAdmin, async function (req, res) {
    try {
        const platformAdminId = req.session.platformAdminId;
        const { getUnreadCount } = require("../utils/notificationService");
        const unreadCount = await getUnreadCount(getPlatformNotificationFilter());

        const since = Number(req.query.since) || 0;
        let needsReload = false;

        if (since > 0) {
            const College = require("../models/collegeSchema");
            const newColleges = await College.countDocuments({
                createdAt: { $gt: new Date(since) }
            });
            if (newColleges > 0) needsReload = true;
        }

        res.json({
            success: true,
            serverTimestamp: Date.now(),
            unreadNotificationCount: unreadCount,
            needsReload: needsReload
        });
    } catch (err) {
        res.json({ success: false });
    }
});

module.exports = router;
