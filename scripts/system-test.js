const mongoose = require("mongoose");
const connectDB = require("/Users/harshkoli/Attendify/config/db");
const PlatformAdmin = require("/Users/harshkoli/Attendify/models/platformAdminSchema");
const liveLocationStore = require("/Users/harshkoli/Attendify/utils/liveLocationStore");
const { getCachedDashboard, setCachedDashboard, invalidateCachedDashboard } = require("/Users/harshkoli/Attendify/utils/studentDashboardCache");
const jobLock = require("/Users/harshkoli/Attendify/utils/jobLock");

async function runSystemTests() {
    console.log("==========================================");
    console.log("  ATTENDIFY SYSTEM VERIFICATION SUITE");
    console.log("==========================================");

    let failedTests = 0;

    // Test 1: MongoDB Connection & Super Admin Auth
    try {
        console.log("\n[TEST 1] Testing MongoDB Connection & Super Admin Auth...");
        await connectDB();
        
        const superAdmin = await PlatformAdmin.findOne({ email: "superadmin@attendify.com" });
        if (!superAdmin) {
            throw new Error("Superadmin not found in database!");
        }
        
        const isPasswordMatch = await superAdmin.comparePassword("super123");
        if (!isPasswordMatch) {
            throw new Error("Superadmin password verification failed!");
        }
        console.log("  ✅ MongoDB connected and superadmin credentials ('superadmin@attendify.com' / 'super123') verified!");
    } catch (err) {
        console.error("  ❌ Test 1 Failed:", err.message);
        failedTests++;
    }

    // Test 2: liveLocationStore API (Async/Sync safety)
    try {
        console.log("\n[TEST 2] Testing liveLocationStore async functionality...");
        const testSessionId = new mongoose.Types.ObjectId().toString();
        const testStudentId = new mongoose.Types.ObjectId().toString();

        const upsertResult = await liveLocationStore.upsertDevice(testSessionId, {
            studentId: testStudentId,
            studentName: "Test Student",
            deviceId: "dev-1",
            latitude: 28.6139,
            longitude: 77.2090,
            accuracy: 10,
            inside: true,
            status: "INSIDE"
        }, "conn-1");

        if (!upsertResult || upsertResult.studentId !== testStudentId) {
            throw new Error("upsertDevice returned invalid payload");
        }

        const snapshot = await liveLocationStore.getSnapshot(testSessionId);
        if (!Array.isArray(snapshot) || snapshot.length === 0) {
            throw new Error("getSnapshot returned empty or non-array result");
        }
        if (snapshot[0].studentId !== testStudentId) {
            throw new Error("getSnapshot studentId mismatch");
        }

        const offlineResult = await liveLocationStore.markDeviceOffline(testSessionId, testStudentId, "dev-1", "conn-1");
        if (!Array.isArray(offlineResult) || offlineResult.length === 0 || offlineResult[0].online !== false) {
            throw new Error("markDeviceOffline did not mark device as offline");
        }

        await liveLocationStore.clearSession(testSessionId);
        const emptySnapshot = await liveLocationStore.getSnapshot(testSessionId);
        if (emptySnapshot.length !== 0) {
            throw new Error("clearSession did not clear the session data");
        }

        console.log("  ✅ liveLocationStore functions (upsert, snapshot, offline, clear) verified!");
    } catch (err) {
        console.error("  ❌ Test 2 Failed:", err.message);
        failedTests++;
    }

    // Test 3: studentDashboardCache API
    try {
        console.log("\n[TEST 3] Testing studentDashboardCache async functionality...");
        const testStudentId = "test-student-cache-" + Date.now();
        const mockData = { activePage: "dashboard", stats: { totalPresent: 10 } };

        await setCachedDashboard(testStudentId, mockData);
        const cached = await getCachedDashboard(testStudentId);
        if (!cached || cached.stats.totalPresent !== 10) {
            throw new Error("getCachedDashboard returned invalid or missing cache data");
        }

        await invalidateCachedDashboard(testStudentId);
        const invalidated = await getCachedDashboard(testStudentId);
        if (invalidated !== null) {
            throw new Error("invalidateCachedDashboard did not clear cache");
        }

        console.log("  ✅ studentDashboardCache (get, set, invalidate) verified!");
    } catch (err) {
        console.error("  ❌ Test 3 Failed:", err.message);
        failedTests++;
    }

    // Test 4: jobLock API
    try {
        console.log("\n[TEST 4] Testing jobLock distributed/worker lock...");
        const lockKey = "test-job-lock-" + Date.now();
        const acquired = await jobLock.acquireLock(lockKey, 5000);
        if (typeof acquired !== "boolean") {
            throw new Error("acquireLock did not return boolean");
        }
        await jobLock.releaseLock(lockKey);
        console.log("  ✅ jobLock (acquireLock, releaseLock) verified!");
    } catch (err) {
        console.error("  ❌ Test 4 Failed:", err.message);
        failedTests++;
    }

    // Test 5: HTTP Server & Healthz check
    try {
        console.log("\n[TEST 5] Testing HTTP server /healthz endpoint...");
        const http = require("http");
        const app = require("/Users/harshkoli/Attendify/app");
        const testServer = http.createServer(app);
        
        await new Promise((resolve) => testServer.listen(0, resolve));
        const port = testServer.address().port;

        const healthRes = await new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
                let data = "";
                res.on("data", chunk => data += chunk);
                res.on("end", () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
            }).on("error", reject);
        });

        testServer.close();

        if (healthRes.statusCode !== 200 || healthRes.body.status !== "ok" || healthRes.body.db !== "connected") {
            throw new Error(`/healthz returned unexpected status: ${JSON.stringify(healthRes)}`);
        }

        console.log("  ✅ Server /healthz check passed! (Status: ok, DB: connected)");
    } catch (err) {
        console.error("  ❌ Test 5 Failed:", err.message);
        failedTests++;
    }

    console.log("\n==========================================");
    if (failedTests === 0) {
        console.log("  🎉 ALL 5 SYSTEM TEST SUITES PASSED!");
    } else {
        console.log(`  ⚠️ ${failedTests} TEST(S) FAILED!`);
    }
    console.log("==========================================");

    await mongoose.connection.close();
    process.exit(failedTests === 0 ? 0 : 1);
}

runSystemTests().catch(err => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
});
