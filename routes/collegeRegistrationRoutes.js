const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30, // Strict limit for auth routes
    message: "Too many attempts from this IP, please try again after a minute.",
    standardHeaders: true,
    legacyHeaders: false
});

const College = require("../models/collegeSchema");
const Teacher = require("../models/teacherSchema");
const CollegeRegistrationRequest = require("../models/collegeRegistrationRequestSchema");
const {
    createNotification,
    getUnreadCount
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

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
    return /^[0-9+\-\s]{7,20}$/.test(phone);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getExactRegex(value) {
    return new RegExp("^" + escapeRegex(value) + "$", "i");
}

function getRegistrationMessage(code) {
    if (code === "submitted") {
        return "Your college registration request has been submitted. Please wait for approval.";
    }

    if (code === "duplicate_college") {
        return "This college already exists or already has a pending request.";
    }

    if (code === "duplicate_admin") {
        return "An admin account with this email already exists or already has a pending request.";
    }

    if (code === "invalid_input") {
        return "Please fill all fields correctly.";
    }

    if (code === "error") {
        return "Something went wrong. Please try again.";
    }

    return null;
}

router.get("/college/register", function (req, res) {
    res.render("collegeRegister", {
        message: getRegistrationMessage(req.query.message),
        formData: {}
    });
});

router.post("/college/register", authLimiter, async function (req, res) {
    try {
        const collegeName = cleanText(req.body.collegeName);
        const address = cleanText(req.body.address);
        const city = cleanText(req.body.city);
        const state = cleanText(req.body.state);

        const adminFullName = cleanText(req.body.adminFullName);
        const adminEmail = cleanEmail(req.body.adminEmail);
        const adminPhone = cleanText(req.body.adminPhone);

        const formData = {
            collegeName,
            address,
            city,
            state,
            adminFullName,
            adminEmail,
            adminPhone
        };

        if (
            !collegeName ||
            !address ||
            !city ||
            !state ||
            !adminFullName ||
            !adminEmail ||
            !adminPhone ||
            !isValidEmail(adminEmail) ||
            !isValidPhone(adminPhone)
        ) {
            return res.render("collegeRegister", {
                message: getRegistrationMessage("invalid_input"),
                formData
            });
        }

        const existingCollege = await College.findOne({
            collegeName: getExactRegex(collegeName),
            city: getExactRegex(city),
            state: getExactRegex(state)
        });

        if (existingCollege) {
            return res.render("collegeRegister", {
                message: getRegistrationMessage("duplicate_college"),
                formData
            });
        }

        const existingPendingCollegeRequest = await CollegeRegistrationRequest.findOne({
            collegeName: getExactRegex(collegeName),
            city: getExactRegex(city),
            state: getExactRegex(state),
            status: "PENDING"
        });

        if (existingPendingCollegeRequest) {
            return res.render("collegeRegister", {
                message: getRegistrationMessage("duplicate_college"),
                formData
            });
        }

        const existingAdmin = await Teacher.findOne({
            email: adminEmail
        });

        if (existingAdmin) {
            return res.render("collegeRegister", {
                message: getRegistrationMessage("duplicate_admin"),
                formData
            });
        }

        const existingPendingAdminRequest = await CollegeRegistrationRequest.findOne({
            adminEmail: adminEmail,
            status: "PENDING"
        });

        if (existingPendingAdminRequest) {
            return res.render("collegeRegister", {
                message: getRegistrationMessage("duplicate_admin"),
                formData
            });
        }

        await CollegeRegistrationRequest.create({
            collegeName,
            address,
            city,
            state,
            adminFullName,
            adminEmail,
            adminPhone,
            status: "PENDING"
        });

        const platformNotification = await createNotification({
            recipientRole: "PLATFORM_ADMIN",
            title: "New college registration request",
            message:
                collegeName +
                " submitted a new college onboarding request.",
            category: "COLLEGE_REQUEST",
            level: "warning",
            link: "/platform-admin/requests?status=PENDING",
            metadata: {
                collegeName: collegeName,
                city: city,
                state: state,
                adminEmail: adminEmail
            },
            createdByType: "system"
        });

        socketManager.emitNotification(platformNotification);

        const platformUnreadCount = await getUnreadCount({
            recipientRole: "PLATFORM_ADMIN"
        });

        socketManager.emitNotificationUnreadCount({
            recipientRole: "PLATFORM_ADMIN",
            unreadCount: platformUnreadCount
        });

        res.redirect("/college/register?message=submitted");

    } catch (err) {
        console.log("COLLEGE REGISTRATION REQUEST ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/college/register?message=error");
    }
});

module.exports = router;
