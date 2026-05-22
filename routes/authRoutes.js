const express = require("express");
const passport = require("passport");

const router = express.Router();

router.get("/", (req, res) => {
    res.render("home");
});

router.get("/student/login", (req, res) => {
    res.render("studentLogin", {
        error: null
    });
});

router.get("/teacher/login", (req, res) => {
    res.render("teacherLogin", {
        error: null
    });
});

router.post("/student/login", (req, res, next) => {
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