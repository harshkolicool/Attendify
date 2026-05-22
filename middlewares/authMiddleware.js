function isLoggedIn(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).send({
            message: "Please login first"
        });
    }

    next();
}

function isStudent(req, res, next) {

    if (!req.isAuthenticated()) {
        return res.status(401).send({
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "student") {
        return res.status(403).send({
            message: "Only students can access this route"
        });
    }

    if (req.user.isBlocked) {
        return res.status(403).send({
            message: "Your student account is blocked"
        });
    }

    next();
}

function isTeacher(req, res, next) {

    if (!req.isAuthenticated()) {
        return res.status(401).send({
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "teacher") {
        return res.status(403).send({
            message: "Only teachers can access this route"
        });
    }

    if (req.user.isBlocked) {
        return res.status(403).send({
            message: "Your teacher account is blocked"
        });
    }

    next();
}

function isAdmin(req, res, next) {

    if (!req.isAuthenticated()) {
        return res.status(401).send({
            message: "Please login first"
        });
    }

    if (req.user.accountType !== "teacher") {
        return res.status(403).send({
            message: "Only admin can access this route"
        });
    }

    if (req.user.role !== "ADMIN") {
        return res.status(403).send({
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