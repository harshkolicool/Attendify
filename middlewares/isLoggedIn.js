/**
 * isLoggedIn middleware — generic authentication guard.
 * Redirects unauthenticated users to the appropriate login page
 * based on the request path, or returns 401 for JSON/API requests.
 */

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }

    // JSON / API requests get a 401
    const accept = req.headers.accept || "";
    if (req.xhr || accept.includes("application/json") || req.path.includes("/api/")) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }

    // Pick redirect based on route prefix
    if (req.path.startsWith("/teacher") || req.path.startsWith("/admin")) {
        return res.redirect("/teacher/login");
    }

    if (req.path.startsWith("/student")) {
        return res.redirect("/student/login");
    }

    return res.redirect("/");
}

module.exports = isLoggedIn;
