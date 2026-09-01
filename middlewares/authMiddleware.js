function isJsonRequest(req) {
    const accept = req.headers.accept || "";
    return req.xhr || accept.includes("application/json") || req.path.includes("/api/");
}

function isLoggedIn(req, res, next) {
    if (!req.isAuthenticated()) {
        if (!isJsonRequest(req)) {
            return res.redirect("/");
        }
        return res.status(401).json({
            success: false,
            message: "Please login first"
        });
    }

    next();
}

function isStudent(req, res, next) {
    if (!req.isAuthenticated()) {
        if (!isJsonRequest(req)) {
            return res.redirect("/student/login");
        }
        return res.status(401).json({
            success: false,
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "student") {
        if (!isJsonRequest(req)) {
            return res.redirect("/teacher/dashboard");
        }
        return res.status(403).json({
            success: false,
            message: "Only students can access this route"
        });
    }

    if (req.user.isBlocked) {
        return res.status(403).json({
            success: false,
            message: "Your student account is blocked"
        });
    }

    next();
}

function isTeacher(req, res, next) {
    if (!req.isAuthenticated()) {
        if (!isJsonRequest(req)) {
            return res.redirect("/teacher/login");
        }
        return res.status(401).json({
            success: false,
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "teacher") {
        if (!isJsonRequest(req)) {
            return res.redirect("/student/dashboard");
        }
        return res.status(403).json({
            success: false,
            message: "Only teachers can access this route"
        });
    }

    if (req.user.isBlocked) {
        return res.status(403).json({
            success: false,
            message: "Your teacher account is blocked"
        });
    }

    next();
}

function isAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
        if (!isJsonRequest(req)) {
            return res.redirect("/teacher/login");
        }
        return res.status(401).json({
            success: false,
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "teacher") {
        return res.status(403).json({
            success: false,
            message: "Only admin can access this route"
        });
    }

    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            success: false,
            message: "Admin access required"
        });
    }

    next();
}

module.exports = {
    isLoggedIn,
    isStudent,
    isTeacher,
    isAdmin
};