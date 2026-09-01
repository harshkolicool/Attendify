/**
 * Attendify Acoustic Radar Test Store
 * Manages active test tokens for teacher-student ultrasonic presence lab testing.
 */

const activeTestTokens = new Map();

function setTestToken(teacherId, data) {
    const key = String(teacherId);
    const tokenObj = {
        token: String(data.token).toUpperCase(),
        teacherId: key,
        teacherName: data.teacherName || "Teacher",
        collegeId: String(data.collegeId || ""),
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
    const cId = String(collegeId || "");
    const now = Date.now();
    for (const [tId, tokenObj] of activeTestTokens.entries()) {
        if (now > tokenObj.expiresAt) {
            activeTestTokens.delete(tId);
            continue;
        }
        if (tokenObj.collegeId === cId || !cId) {
            return tokenObj;
        }
    }
    return null;
}

function clearTestToken(teacherId) {
    const key = String(teacherId);
    activeTestTokens.delete(key);
}

module.exports = {
    setTestToken,
    getTestTokenByTeacher,
    getActiveTestTokenForCollege,
    clearTestToken
};
