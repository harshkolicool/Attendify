function isCollegeAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect("/admin/login");
    }

    if (req.user.accountType !== "teacher") {
        return res.redirect("/");
    }

    if (req.user.role !== "ADMIN") {
        return res.redirect("/teacher/dashboard");
    }

    if (req.user.isBlocked) {
        return res.send("Your admin account is blocked. Contact support.");
    }

    next();
}

module.exports = isCollegeAdmin;
