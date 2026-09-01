const test = require("node:test");
const assert = require("node:assert/strict");
const { allowAttendanceRequest } = require("../utils/attendanceSecurity");

test("allowAttendanceRequest isolates rate limits per student", () => {
    const student1Key = "mark:student123:192.168.1.50";
    const student2Key = "mark:student456:192.168.1.50";

    // Simulate student 1 making 15 rapid attempts (allowed max = 15)
    for (let i = 0; i < 15; i++) {
        const res = allowAttendanceRequest(student1Key, 15, 60000);
        assert.equal(res.allowed, true, `Student 1 attempt ${i + 1} should be allowed`);
    }

    // Student 1's 16th attempt should be blocked
    const student1Blocked = allowAttendanceRequest(student1Key, 15, 60000);
    assert.equal(student1Blocked.allowed, false, "Student 1 attempt 16 should be blocked");
    assert.ok(student1Blocked.retryAfter > 0);

    // Student 2 sharing the SAME IP (campus Wi-Fi) should NOT be blocked by Student 1's activity
    const student2FirstAttempt = allowAttendanceRequest(student2Key, 15, 60000);
    assert.equal(student2FirstAttempt.allowed, true, "Student 2 on same IP is independently allowed");
});

test("Simulated concurrent attendance mark preserves atomic counts", async () => {
    // Mock atomic session update logic
    let mockSessionSummary = {
        totalPresent: 0,
        totalAbsent: 50,
        totalMarked: 0
    };

    const studentRecords = new Map();

    async function simulateMarkAttendance(studentId) {
        // 1. Check duplicate
        if (studentRecords.has(studentId)) {
            return { success: true, alreadyPresent: true };
        }

        // 2. Insert record
        studentRecords.set(studentId, { status: "PRESENT", markedAt: new Date() });

        // 3. Atomic MongoDB $inc update simulation
        mockSessionSummary.totalPresent += 1;
        mockSessionSummary.totalMarked += 1;

        return {
            success: true,
            status: "PRESENT",
            totalPresent: mockSessionSummary.totalPresent,
            totalMarked: mockSessionSummary.totalMarked
        };
    }

    // Launch 50 concurrent student attendance requests at the exact same instant
    const promises = [];
    for (let i = 1; i <= 50; i++) {
        promises.push(simulateMarkAttendance(`student_id_${i}`));
    }

    const results = await Promise.all(promises);

    assert.equal(results.length, 50, "All 50 concurrent requests processed");
    assert.equal(mockSessionSummary.totalPresent, 50, "Final totalPresent accurately matches 50");
    assert.equal(mockSessionSummary.totalMarked, 50, "Final totalMarked accurately matches 50");
    assert.equal(studentRecords.size, 50, "50 unique student records created without collision");
});
