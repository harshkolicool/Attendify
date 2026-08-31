const http = require("http");
const app = require("/Users/harshkoli/Attendify/app");
const connectDB = require("/Users/harshkoli/Attendify/config/db");
const mongoose = require("mongoose");

const publicRoutes = [
    { method: "GET", path: "/", expectedStatus: 200, name: "Landing Page" },
    { method: "GET", path: "/college/register", expectedStatus: 200, name: "College Registration Page" },
    { method: "GET", path: "/student/login", expectedStatus: 200, name: "Student Login Page" },
    { method: "GET", path: "/student/register", expectedStatus: 200, name: "Student Register Page" },
    { method: "GET", path: "/teacher/login", expectedStatus: 200, name: "Teacher Login Page" },
    { method: "GET", path: "/admin/login", expectedStatus: 200, name: "Admin Login Page" },
    { method: "GET", path: "/platform-admin/login", expectedStatus: 200, name: "Platform Super Admin Login Page" },
    { method: "GET", path: "/healthz", expectedStatus: 200, name: "Healthcheck Endpoint" },
    { method: "GET", path: "/some-non-existent-page-404", expectedStatus: 404, name: "404 Error Page" },
    { method: "GET", path: "/student/dashboard", expectedStatus: 302, name: "Student Dashboard (Protected Redirect)" },
    { method: "GET", path: "/teacher/dashboard", expectedStatus: 302, name: "Teacher Dashboard (Protected Redirect)" },
    { method: "GET", path: "/admin/dashboard", expectedStatus: 302, name: "Admin Dashboard (Protected Redirect)" },
    { method: "GET", path: "/platform-admin/dashboard", expectedStatus: 302, name: "Platform Admin Dashboard (Protected Redirect)" }
];

async function runEndpointTests() {
    console.log("==========================================");
    console.log("  ATTENDIFY ENDPOINT & UI RENDER TEST");
    console.log("==========================================");

    await connectDB();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    let passed = 0;
    let failed = 0;

    for (const route of publicRoutes) {
        try {
            const res = await new Promise((resolve, reject) => {
                const req = http.request({
                    hostname: "127.0.0.1",
                    port: port,
                    path: route.path,
                    method: route.method,
                    headers: {
                        "Accept": "text/html,application/xhtml+xml,application/xml"
                    }
                }, (response) => {
                    let body = "";
                    response.on("data", (chunk) => body += chunk);
                    response.on("end", () => resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        bodyLength: body.length
                    }));
                });
                req.on("error", reject);
                req.end();
            });

            if (res.statusCode === route.expectedStatus) {
                console.log(`  ✅ [${res.statusCode}] ${route.name} (${route.path}) — Rendered ${res.bodyLength} bytes`);
                passed++;
            } else {
                console.error(`  ❌ [${res.statusCode} != ${route.expectedStatus}] ${route.name} (${route.path})`);
                failed++;
            }
        } catch (err) {
            console.error(`  ❌ Error fetching ${route.name} (${route.path}):`, err.message);
            failed++;
        }
    }

    server.close();
    await mongoose.connection.close();

    console.log("\n==========================================");
    console.log(`  Passed: ${passed} | Failed: ${failed}`);
    if (failed === 0) {
        console.log("  🎉 ALL ROUTES RENDERED CLEANLY WITHOUT ERRORS!");
    }
    console.log("==========================================");

    process.exit(failed === 0 ? 0 : 1);
}

runEndpointTests().catch(err => {
    console.error("Test Suite Fatal Error:", err);
    process.exit(1);
});
