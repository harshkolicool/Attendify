const PlatformAdmin = require("../models/platformAdminSchema");

async function isPlatformAdmin(req, res, next) {
    try {
        if (!req.session || !req.session.platformAdminId) {
            return res.redirect("/platform-admin/login");
        }

        const platformAdmin = await PlatformAdmin.findById(
            req.session.platformAdminId
        ).select("-password");

        if (!platformAdmin) {
            req.session.platformAdminId = null;
            return res.redirect("/platform-admin/login");
        }

        if (platformAdmin.isBlocked) {
            req.session.platformAdminId = null;
            return res.send("Your platform admin account is blocked.");
        }

        req.platformAdmin = platformAdmin;
        res.locals.platformAdmin = platformAdmin;

        next();

    } catch (err) {
        console.log("PLATFORM ADMIN MIDDLEWARE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Platform admin authorization error. Please try again.");
    }
}

module.exports = isPlatformAdmin;
