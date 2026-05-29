process.env.TZ = process.env.TZ || "Asia/Kolkata";
require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const passport = require("passport");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
require("./config/passport");

const csrfProtection = require("./middlewares/csrfProtection");
const realtimeConfig = require("./utils/realtimeConfig");

const authRoutes = require("./routes/authRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const collegeRegistrationRoutes = require("./routes/collegeRegistrationRoutes");
const platformAdminRoutes = require("./routes/platformAdminRoutes");

const app = express();

function validateObjectId(req, res, next, id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        if (
            req.method !== "GET" ||
            req.xhr ||
            (req.headers.accept && req.headers.accept.includes("json"))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid request id."
            });
        }

        return res.redirect("back");
    }

    next();
}

app.param("id", validateObjectId);
app.param("sessionId", validateObjectId);
app.param("scheduleId", validateObjectId);
app.param("classgroupId", validateObjectId);
app.param("classroomId", validateObjectId);
app.param("subjectId", validateObjectId);
app.param("studentId", validateObjectId);
app.param("teacherId", validateObjectId);
app.param("requestId", validateObjectId);

const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");

const forceUpgradeInsecureRequests =
    process.env.CSP_UPGRADE_INSECURE_REQUESTS === "true";

const helmetDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net"
    ],
    styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
    ],
    fontSrc: [
        "'self'",
        "https://cdnjs.cloudflare.com",
        "https://fonts.gstatic.com",
        "data:"
    ],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    connectSrc: ["'self'", "https:", "wss:"],
    scriptSrcAttr: ["'unsafe-inline'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
};

if (forceUpgradeInsecureRequests) {
    helmetDirectives.upgradeInsecureRequests = [];
} else {
    helmetDirectives.upgradeInsecureRequests = null;
}

app.use(
    helmet({
        crossOriginEmbedderPolicy: false,
        contentSecurityPolicy: {
            useDefaults: true,
            directives: helmetDirectives
        }
    })
);

app.set("trust proxy", 1);

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
    throw new Error("SESSION_SECRET is missing in .env file");
}

if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long");
}

if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env file");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "public")));

/*
    Important fix:
    Do not call connectDB() without await at app startup.
    This middleware makes sure real requests wait until MongoDB is ready.
*/
app.use(async function ensureDatabaseConnection(req, res, next) {
    try {
        await connectDB();
        next();
    } catch (err) {
        next(err);
    }
});

app.use(
    rateLimit({
        windowMs: 60 * 1000,
        limit: 3000,
        standardHeaders: true,
        legacyHeaders: false
    })
);

const sessionMiddleware = session({
    name: "attendance.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: "sessions",
        ttl: 60 * 60 * 8,
        touchAfter: 24 * 3600
    }),
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 8
    }
});

app.set("sessionMiddleware", sessionMiddleware);
app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

app.use(csrfProtection());

app.use(function injectRealtimeLocals(req, res, next) {
    res.locals.realtimeMode = realtimeConfig.getRealtimeMode();
    res.locals.realtimePollIntervalMs = realtimeConfig.getPollIntervalMs();
    next();
});

app.use("/", authRoutes);
app.use("/", collegeRegistrationRoutes);
app.use("/", platformAdminRoutes);
app.use("/teacher", teacherRoutes);
app.use("/student", studentRoutes);
app.use("/admin", adminRoutes);

function requestWantsJson(req) {
    const accept = req.headers.accept || "";
    return req.xhr || req.path.indexOf("/api/") === 0 || accept.includes("application/json");
}

app.use(function (req, res) {
    if (requestWantsJson(req)) {
        return res.status(404).json({
            success: false,
            message: "Page not found."
        });
    }

    res.status(404).render("404");
});

app.use(function (err, req, res, next) {
    console.log("SERVER ERROR:", err.message);
    console.log(err.stack);

    const statusCode = err.status || 500;
    const userMessage = isProduction
        ? "Something went wrong. Please try again later."
        : err.message;

    res.status(statusCode).send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            "<title>" +
            statusCode +
            " — Server Error | Attendify</title>" +
            '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">' +
            "<style>" +
            "*{margin:0;padding:0;box-sizing:border-box}" +
            'body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f0f2f5;color:#1a1a2e}' +
            ".error-wrap{text-align:center;padding:3rem 2rem;max-width:480px}" +
            ".error-code{font-size:6rem;font-weight:800;background:linear-gradient(135deg,#e74c3c,#c0392b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1}" +
            ".error-title{font-size:1.5rem;font-weight:600;margin:.75rem 0 .5rem}" +
            ".error-msg{color:#555;margin-bottom:2rem;line-height:1.6;word-break:break-word}" +
            ".error-btn{display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.75rem;border:none;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:.95rem;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .15s,box-shadow .15s}" +
            ".error-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(102,126,234,.4)}" +
            "</style></head><body>" +
            '<div class="error-wrap">' +
            '<div class="error-code">' +
            statusCode +
            "</div>" +
            '<h1 class="error-title">Server Error</h1>' +
            '<p class="error-msg">' +
            userMessage +
            "</p>" +
            '<a href="/" class="error-btn"><i class="fa-solid fa-house"></i> Go Home</a>' +
            "</div></body></html>"
    );
});

module.exports = app;