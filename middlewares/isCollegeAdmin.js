const Teacher = require("../models/teacherSchema");
const College = require("../models/collegeSchema");

async function isCollegeAdmin(req, res, next) {
    try {
        if (!req.isAuthenticated()) {
            return res.redirect("/admin/login");
        }

        if (!req.user || req.user.accountType !== "teacher") {
            return res.redirect("/");
        }

        const admin = await Teacher.findById(req.user._id || req.user.id)
            .select("-password");

        if (!admin) {
            req.logout(function () {
                return res.redirect("/admin/login");
            });
            return;
        }

        if (admin.isBlocked) {
            req.logout(function () {
                return res.send("Your admin account is blocked. Contact support.");
            });
            return;
        }

        if (admin.role !== "ADMIN") {
            return res.redirect("/teacher/dashboard");
        }

        if (!admin.college) {
            req.logout(function () {
                return res.send("Admin account is not linked to any college.");
            });
            return;
        }

        const college = await College.findById(admin.college);

        if (!college) {
            req.logout(function () {
                return res.send("College linked with this admin account does not exist.");
            });
            return;
        }

        const adminData = admin.toObject();
        adminData.accountType = "teacher";

        req.user = adminData;
        req.admin = adminData;
        req.college = college;
        req.collegeId = college._id;

        res.locals.currentAdmin = adminData;
        res.locals.currentCollege = college;
        res.locals.collegeId = college._id;

        next();

    } catch (err) {
        console.log("COLLEGE ADMIN MIDDLEWARE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Admin authorization error. Please try again.");
    }
}

module.exports = isCollegeAdmin;
