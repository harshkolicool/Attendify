/**
 * Attendify Acoustic Radar Test Store
 * Manages active test tokens for teacher-student ultrasonic presence lab testing.
 */

const activeTestTokens = new Map();

function setTestToken(teacherId, data) {
    const key = String(teacherId);
    const rawCollege = data.collegeId || (data.college ? (data.college._id || data.college) : "");
    const collegeStr = rawCollege ? String(rawCollege._id || rawCollege) : "";

    const tokenObj = {
        token: String(data.token).toUpperCase().trim(),
        teacherId: key,
        teacherName: data.teacherName || "Teacher",
        collegeId: collegeStr,
        createdAt: Date.now(),
        expiresAt: Date.now() + 15 * 60 * 1000 // 15 minute test session
    };
    activeTestTokens.set(key, tokenObj);
    return tokenObj;
}

function getTestTokenByTeacher(teacherId) {
    const key = String(teacherId);
    const tokenObj = activeTestTokens.get(key);
    if (!tokenObj) return null;
    if (Date.now() > tokenObj.expiresAt) {
        activeTestTokens.delete(key);
        return null;
    }
    return tokenObj;
}

function getActiveTestTokenForCollege(collegeId) {
    const rawCollege = collegeId ? (collegeId._id || collegeId) : "";
    const cId = String(rawCollege || "");
    const now = Date.now();
    for (const [tId, tokenObj] of activeTestTokens.entries()) {
        if (now > tokenObj.expiresAt) {
            activeTestTokens.delete(tId);
            continue;
        }
        if (tokenObj.collegeId === cId || !cId || !tokenObj.collegeId) {
            return tokenObj;
        }
    }
    return null;
}

/**
 * Finds matching active test token:
 * 1. Checks exact match against any active teacher test beacon in memory.
 * 2. Checks rolling window matches (±1 window) against active teacher test beacons.
 * 3. Falls back to college-level active test token.
 */
function findMatchingTestToken(candidateToken, collegeId) {
    const clean = String(candidateToken || "").toUpperCase().trim();
    const now = Date.now();

    // 1. Direct match across all active tokens
    if (clean) {
        for (const [tId, tokenObj] of activeTestTokens.entries()) {
            if (now > tokenObj.expiresAt) {
                activeTestTokens.delete(tId);
                continue;
            }
            if (tokenObj.token === clean) {
                return tokenObj;
            }
        }

        // 2. Rolling window match across active tokens
        const crypto = require("crypto");
        const currentWin = Math.floor(now / 20000);
        for (const [tId, tokenObj] of activeTestTokens.entries()) {
            if (now > tokenObj.expiresAt) continue;
            for (let w = currentWin - 1; w <= currentWin + 1; w++) {
                const raw = tokenObj.token + ":" + w;
                const rollingToken = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase().slice(0, 4);
                if (clean === rollingToken) {
                    return tokenObj;
                }
            }
        }
    }

    // 3. Fallback: match by collegeId
    return getActiveTestTokenForCollege(collegeId);
}

function clearTestToken(teacherId) {
    const key = String(teacherId);
    activeTestTokens.delete(key);
}

module.exports = {
    setTestToken,
    getTestTokenByTeacher,
    getActiveTestTokenForCollege,
    findMatchingTestToken,
    clearTestToken
};
