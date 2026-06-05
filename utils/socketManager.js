let ioInstance = null;

const Student = require("../models/studentSchema");
const Teacher = require("../models/teacherSchema");
const PlatformAdmin = require("../models/platformAdminSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const liveLocationStore = require("./liveLocationStore");
const {
    evaluateLocationRange,
    computeVerificationRadius
} = require("./locationVerification");
const gpsPeerCalibration = require("./gpsPeerCalibration");

const LOCATION_PERSIST_INTERVAL_MS = 30000;
const locationPersistedAt = new Map();

function getId(value) {
    if (!value) {
        return "";
    }

    if (value._id) {
        return value._id.toString();
    }

    return value.toString();
}

function getSessionUser(socket) {
    if (
        !socket ||
        !socket.request ||
        !socket.request.session ||
        !socket.request.session.passport ||
        !socket.request.session.passport.user
    ) {
        return null;
    }

    return socket.request.session.passport.user;
}

function getPlatformAdminSessionId(socket) {
    if (!socket || !socket.request || !socket.request.session) {
        return null;
    }

    return socket.request.session.platformAdminId || null;
}

function reloadSocketSession(socket) {
    return new Promise(function (resolve) {
        if (
            !socket ||
            !socket.request ||
            !socket.request.session ||
            typeof socket.request.session.reload !== "function"
        ) {
            return resolve();
        }

        socket.request.session.reload(function () {
            resolve();
        });
    });
}

function emitSocketError(socket, message) {
    if (!socket || !socket.connected) {
        return;
    }

    socket.emit("socket:error", {
        message: message || "Realtime connection error."
    });
}

function getStudentRoom(studentId) {
    return "student:" + studentId.toString();
}

function getTeacherRoom(teacherId) {
    return "teacher:" + teacherId.toString();
}

function getAdminCollegeRoom(collegeId) {
    return "admin:college:" + collegeId.toString();
}

function getClassGroupRoom(classGroupId) {
    return "classGroup:" + classGroupId.toString();
}

function getPlatformAdminRoom() {
    return "platform-admin:all";
}

function getWaitingStudentRoom(studentId) {
    return "student:waiting:" + studentId.toString();
}

function getSessionRoom(sessionId) {
    return "attendanceSession:" + sessionId.toString();
}

function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}



function getTrackedDeviceKey(sessionId, studentId, deviceId) {
    return [
        String(sessionId || ""),
        String(studentId || ""),
        String(deviceId || "default")
    ].join(":");
}

function rememberTrackedDevice(socket, sessionId, studentId, deviceId) {
    if (!socket.data.trackedDevicesBySession) {
        socket.data.trackedDevicesBySession = {};
    }

    const sessionKey = String(sessionId);

    if (!socket.data.trackedDevicesBySession[sessionKey]) {
        socket.data.trackedDevicesBySession[sessionKey] = {};
    }

    socket.data.trackedDevicesBySession[sessionKey][String(deviceId || "default")] = {
        studentId: String(studentId || ""),
        deviceId: String(deviceId || "default")
    };
}

function mapPersistedLiveDevice(device, sessionId) {
    if (!device) {
        return null;
    }

    const studentId = getId(device.student);

    if (!studentId) {
        return null;
    }

    return {
        sessionId: String(sessionId),
        studentId: studentId,
        studentName: device.studentName || "Student",
        enrollmentNumber: device.enrollmentNumber || "",
        deviceId: device.deviceId || "default",
        deviceLabel: device.deviceLabel || "Device",
        latitude: Number(device.latitude),
        longitude: Number(device.longitude),
        accuracy:
            device.accuracy === null || device.accuracy === undefined
                ? null
                : Number(device.accuracy),
        distance: Number(device.distance || 0),
        configuredRadius: Number(device.configuredRadius || 0),
        effectiveRadius: Number(device.effectiveRadius || 0),
        uncertaintyAllowance: Number(device.uncertaintyAllowance || 0),
        inside: Boolean(device.inside),
        status: device.status || "UNKNOWN",
        reasonCode: device.reasonCode || "",
        updatedAt: device.lastActiveAt || new Date(),
        online: Boolean(device.online)
    };
}

function getPersistedLocationSnapshot(session) {
    if (!session || !Array.isArray(session.liveDevices)) {
        return [];
    }

    return session.liveDevices
        .map(function (device) {
            return mapPersistedLiveDevice(device, session._id);
        })
        .filter(Boolean);
}

function shouldPersistLocation(sessionId, studentId, deviceId) {
    const key = getTrackedDeviceKey(sessionId, studentId, deviceId);
    const now = Date.now();
    const previous = Number(locationPersistedAt.get(key) || 0);

    if (now - previous < LOCATION_PERSIST_INTERVAL_MS) {
        return false;
    }

    locationPersistedAt.set(key, now);
    return true;
}

async function persistLiveDeviceLocation(payload) {
    if (!payload || !payload.sessionId || !payload.studentId) {
        return;
    }

    if (!shouldPersistLocation(payload.sessionId, payload.studentId, payload.deviceId)) {
        return;
    }

    const deviceDoc = {
        student: payload.studentId,
        studentName: payload.studentName || "Student",
        enrollmentNumber: payload.enrollmentNumber || "",
        deviceId: payload.deviceId || "default",
        deviceLabel: payload.deviceLabel || "Device",
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        accuracy:
            payload.accuracy === null || payload.accuracy === undefined
                ? null
                : Number(payload.accuracy),
        distance: Number(payload.distance || 0),
        configuredRadius: Number(payload.configuredRadius || 0),
        effectiveRadius: Number(payload.effectiveRadius || 0),
        uncertaintyAllowance: Number(payload.uncertaintyAllowance || 0),
        inside: Boolean(payload.inside),
        status: payload.status || "UNKNOWN",
        reasonCode: payload.reasonCode || "",
        online: payload.online !== false,
        lastActiveAt: payload.updatedAt || new Date()
    };

    // Attempt to update existing device atomically using arrayFilters
    const result = await AttendanceSession.updateOne(
        { _id: payload.sessionId },
        { $set: { "liveDevices.$[elem]": deviceDoc } },
        { arrayFilters: [{ "elem.student": payload.studentId, "elem.deviceId": payload.deviceId || "default" }] }
    );

    // If device doesn't exist yet, push it
    if (result.matchedCount > 0 && result.modifiedCount === 0 && !result.upsertedId) {
        // Matched session but array filter didn't match (element not found)
        // Actually, if arrayFilter doesn't match, modifiedCount is 0, but wait, Mongoose returns matchedCount=1 if the parent document matches.
        // Let's do a safe fallback push if modifiedCount is 0 (meaning either array element didn't exist, or it was identical).
        // Since we update lastActiveAt to Date.now(), it's extremely rare for it to be identical.
    }
    
    // Safer and cleaner approach for Mongoose:
    // Mongoose arrayFilters will modify 0 docs if the element doesn't exist.
    if (result.modifiedCount === 0) {
        // Clean any potential duplicate first to prevent array bloat in edge cases
        await AttendanceSession.updateOne(
            { _id: payload.sessionId },
            { $pull: { liveDevices: { student: payload.studentId, deviceId: payload.deviceId || "default" } } }
        );
        // Then push the new document
        await AttendanceSession.updateOne(
            { _id: payload.sessionId },
            { $push: { liveDevices: deviceDoc } }
        );
    }
}

async function persistOfflineDevice(payload) {
    if (!payload || !payload.sessionId || !payload.studentId) {
        return;
    }

    await AttendanceSession.updateOne(
        {
            _id: payload.sessionId,
            "liveDevices.student": payload.studentId,
            "liveDevices.deviceId": payload.deviceId || "default"
        },
        {
            $set: {
                "liveDevices.$.online": false,
                "liveDevices.$.lastActiveAt": payload.updatedAt || new Date()
            }
        }
    );
}

function initializeSocket(io) {
    ioInstance = io;

    io.on("connection", function (socket) {
        const isWaitingStudent = socket.handshake.query && socket.handshake.query.waitingId;

        if (!getSessionUser(socket) && !getPlatformAdminSessionId(socket) && !isWaitingStudent) {
            emitSocketError(socket, "Login required for realtime updates.");
            socket.disconnect(true);
            return;
        }

        if (isWaitingStudent) {
            const waitingId = String(socket.handshake.query.waitingId || "");
            const sessionPendingId =
                socket.request &&
                socket.request.session &&
                socket.request.session.pendingRegistrationId
                    ? String(socket.request.session.pendingRegistrationId)
                    : "";

            if (!waitingId || !sessionPendingId || waitingId !== sessionPendingId) {
                emitSocketError(socket, "Waiting room authorization failed.");
                socket.disconnect(true);
                return;
            }

            socket.join(getWaitingStudentRoom(waitingId));
            socket.data.isWaitingStudent = true;
            socket.data.waitingId = waitingId;
            return;
        }

        socket.on("student:join", async function () {
            try {
                if (socket.data && socket.data.studentJoined === true) {
                    socket.emit("student:joined", {
                        studentId: socket.data.studentId || "",
                        classGroupId: socket.data.classGroupId || "",
                        collegeId: socket.data.collegeId || ""
                    });
                    return;
                }

                await reloadSocketSession(socket);
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "student") {
                    emitSocketError(socket, "Student realtime access is not available for this session.");
                    return;
                }

                const studentId = currentUser._id || currentUser.id;

                const student = await Student.findOne({ _id: studentId, isDeleted: { $ne: true }, isBlocked: { $ne: true } }).select("classGroup college fullName enrollmentNumber email");

                if (!student || !student.classGroup) {
                    emitSocketError(socket, "Student realtime setup is incomplete.");
                    return;
                }

                socket.join(getStudentRoom(student._id));
                socket.join(getClassGroupRoom(student.classGroup));
                socket.data.studentJoined = true;
                socket.data.studentId = student._id.toString();
                socket.data.classGroupId = student.classGroup.toString();
                socket.data.collegeId = student.college ? student.college.toString() : "";
                socket.data.studentName = student.fullName || "";
                socket.data.enrollmentNumber = student.enrollmentNumber || student.email || "";

                socket.emit("student:joined", {
                    studentId: student._id.toString(),
                    classGroupId: student.classGroup.toString(),
                    collegeId: student.college ? student.college.toString() : ""
                });
            } catch (err) {
                console.log("SOCKET STUDENT JOIN ERROR:");
                console.log(err.message);
            }
        });

        socket.on("teacher:join", async function () {
            try {
                if (socket.data && socket.data.teacherJoined === true) {
                    socket.emit("teacher:joined", {
                        teacherId: socket.data.teacherId || "",
                        role: socket.data.teacherRole || "TEACHER",
                        collegeId: socket.data.collegeId || ""
                    });
                    return;
                }

                await reloadSocketSession(socket);
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "teacher") {
                    emitSocketError(socket, "Teacher realtime access is not available for this session.");
                    return;
                }

                const teacherId = currentUser._id || currentUser.id;

                const teacher = await Teacher.findOne({ _id: teacherId, isDeleted: { $ne: true }, isBlocked: { $ne: true } }).select("fullName college role");

                if (!teacher) {
                    emitSocketError(socket, "Teacher realtime profile was not found.");
                    return;
                }

                socket.join(getTeacherRoom(teacher._id));
                socket.data.teacherId = teacher._id.toString();
                socket.data.teacherName = teacher.fullName || "";
                socket.data.teacherRole = teacher.role || "TEACHER";
                socket.data.collegeId = teacher.college ? teacher.college.toString() : "";

                if (teacher.role === "ADMIN" && teacher.college) {
                    socket.join(getAdminCollegeRoom(teacher.college));
                }

                socket.data.teacherJoined = true;

                socket.emit("teacher:joined", {
                    teacherId: teacher._id.toString(),
                    role: teacher.role || "TEACHER",
                    collegeId: teacher.college ? teacher.college.toString() : ""
                });
            } catch (err) {
                console.log("SOCKET TEACHER JOIN ERROR:");
                console.log(err.message);
            }
        });

        socket.on("admin:join", async function () {
            try {
                if (socket.data && socket.data.adminJoined === true) {
                    socket.emit("admin:joined", {
                        adminId: socket.data.teacherId || "",
                        collegeId: socket.data.adminCollegeId || socket.data.collegeId || ""
                    });
                    return;
                }

                await reloadSocketSession(socket);
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "teacher") {
                    emitSocketError(socket, "Admin realtime access is not available for this session.");
                    return;
                }

                const teacherId = currentUser._id || currentUser.id;

                const admin = await Teacher.findOne({ _id: teacherId, isDeleted: { $ne: true }, isBlocked: { $ne: true } }).select("college role");

                if (!admin || admin.role !== "ADMIN" || !admin.college) {
                    emitSocketError(socket, "Admin realtime profile is not eligible.");
                    return;
                }

                socket.join(getTeacherRoom(admin._id));
                socket.join(getAdminCollegeRoom(admin.college));
                socket.data.adminJoined = true;
                socket.data.teacherId = admin._id.toString();
                socket.data.adminCollegeId = admin.college.toString();

                socket.emit("admin:joined", {
                    adminId: admin._id.toString(),
                    collegeId: admin.college.toString()
                });
            } catch (err) {
                console.log("SOCKET ADMIN JOIN ERROR:");
                console.log(err.message);
            }
        });

        socket.on("platform-admin:join", async function () {
            try {
                if (socket.data && socket.data.platformAdminJoined === true) {
                    socket.emit("platform-admin:joined", {
                        platformAdminId: socket.data.platformAdminId || "",
                        email: socket.data.platformAdminEmail || ""
                    });
                    return;
                }

                await reloadSocketSession(socket);
                const platformAdminId = getPlatformAdminSessionId(socket);

                if (!platformAdminId) {
                    emitSocketError(socket, "Platform admin realtime session not found.");
                    return;
                }

                const platformAdmin = await PlatformAdmin.findById(platformAdminId)
                    .select("email isBlocked");

                if (!platformAdmin || platformAdmin.isBlocked) {
                    emitSocketError(socket, "Platform admin realtime access is blocked.");
                    return;
                }

                socket.join(getPlatformAdminRoom());
                socket.data.platformAdminJoined = true;
                socket.data.platformAdminId = platformAdmin._id.toString();
                socket.data.platformAdminEmail = platformAdmin.email || "";

                socket.emit("platform-admin:joined", {
                    platformAdminId: platformAdmin._id.toString(),
                    email: platformAdmin.email || ""
                });
            } catch (err) {
                console.log("SOCKET PLATFORM ADMIN JOIN ERROR:");
                console.log(err.message);
            }
        });

        socket.on("teacher:watch-session", async function (payload) {
            try {
                await reloadSocketSession(socket);
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "teacher") {
                    emitSocketError(socket, "Teacher session required.");
                    return;
                }

                const sessionId = payload && payload.sessionId ? String(payload.sessionId) : "";
                if (!sessionId) {
                    return;
                }

                const session = await AttendanceSession.findOne({
                    _id: sessionId,
                    teacher: currentUser._id,
                    isActive: true,
                    status: "ACTIVE"
                })
                    .select("_id teacher classGroup latitude longitude radius endTime liveDevices")
                    .populate("classGroup", "name");

                if (!session) {
                    return;
                }

                const classGroupId = session.classGroup
                    ? session.classGroup._id || session.classGroup
                    : null;

                let roster = [];

                const teacherProfile = await Teacher.findOne({ _id: currentUser._id, isDeleted: { $ne: true }, isBlocked: { $ne: true } }).select("college");

                if (classGroupId && teacherProfile && teacherProfile.college) {
                    roster = await Student.find({
                        college: teacherProfile.college,
                        classGroup: classGroupId,
                        isDeleted: { $ne: true },
                        isBlocked: { $ne: true }
                    })
                        .select("fullName enrollmentNumber profileImage")
                        .sort({ fullName: 1 })
                        .lean();
                }

                const memorySnapshot = liveLocationStore.getSnapshot(session._id);
                const persistedSnapshot = getPersistedLocationSnapshot(session);

                const sessionRadius = Number(session.radius || 0);
                const teacherGpsAccuracy = Number(session.teacherGpsAccuracy || 0);
                const radiusPreview = computeVerificationRadius(
                    sessionRadius,
                    0,
                    teacherGpsAccuracy
                );

                socket.join(getSessionRoom(session._id));
                socket.emit("teacher:watch-session:ok", {
                    sessionId: session._id.toString(),
                    latitude: Number(session.latitude || 0),
                    longitude: Number(session.longitude || 0),
                    radius: sessionRadius,
                    configuredRadius: radiusPreview.adminConfiguredRadius,
                    effectiveRadius: radiusPreview.verificationRadius,
                    combinedAccuracy: radiusPreview.combinedAccuracy,
                    endTime: session.endTime,
                    classGroupName: session.classGroup ? session.classGroup.name || "" : "",
                    roster: roster.map(function (student) {
                        return {
                            studentId: student._id.toString(),
                            fullName: student.fullName || "Student",
                            enrollmentNumber: student.enrollmentNumber || ""
                        };
                    }),
                    snapshot: memorySnapshot.length > 0 ? memorySnapshot : persistedSnapshot
                });
            } catch (err) {
                console.log("SOCKET TEACHER WATCH SESSION ERROR:");
                console.log(err.message);
            }
        });

        socket.on("disconnect", function () {
            try {
                if (!socket.data || socket.data.studentJoined !== true || !socket.data.studentId) {
                    return;
                }

                const io = getIO();
                if (!io) {
                    return;
                }

                const trackedBySession = socket.data.trackedDevicesBySession || {};
                const activeSessionIds = Object.keys(trackedBySession);

                for (let i = 0; i < activeSessionIds.length; i++) {
                    const sessionId = activeSessionIds[i];
                    const devices = Object.values(trackedBySession[sessionId] || {});

                    for (let j = 0; j < devices.length; j++) {
                        const trackedDevice = devices[j];
                        const offlineDevices = liveLocationStore.markDeviceOffline(
                            sessionId,
                            trackedDevice.studentId,
                            trackedDevice.deviceId,
                            socket.id
                        );

                        for (let k = 0; k < offlineDevices.length; k++) {
                            const device = offlineDevices[k];
                            const offlinePayload = Object.assign({}, device, {
                                online: false,
                                updatedAt: new Date()
                            });

                            io.to(getSessionRoom(sessionId)).emit("student:location:update", offlinePayload);

                            persistOfflineDevice(offlinePayload).catch(function () {
                                // ignore persistence failures during disconnect cleanup
                            });
                            AttendanceSession.findById(sessionId)
                                .select("teacher")
                                .then(function (sessionDoc) {
                                    if (sessionDoc && sessionDoc.teacher) {
                                        io.to(getTeacherRoom(sessionDoc.teacher)).emit(
                                            "student:location:update",
                                            offlinePayload
                                        );
                                    }
                                })
                                .catch(function () {
                                    // ignore
                                });
                        }
                    }
                }
            } catch (err) {
                console.log("SOCKET STUDENT DISCONNECT LOCATION ERROR:");
                console.log(err.message);
            }
        });

        socket.on("student:location:update", async function (payload) {
            try {
                if (!socket.data || socket.data.studentJoined !== true) {
                    return;
                }

                const now = Date.now();
                const lastTs = Number(socket.data.lastStudentLocationTs || 0);
                if (now - lastTs < 1500) {
                    return;
                }
                socket.data.lastStudentLocationTs = now;

                const sessionId = payload && payload.sessionId ? String(payload.sessionId) : "";
                const deviceId = payload && payload.deviceId ? String(payload.deviceId) : "";
                const deviceLabel = payload && payload.deviceLabel ? String(payload.deviceLabel) : "";
                const latitude = payload ? Number(payload.latitude) : NaN;
                const longitude = payload ? Number(payload.longitude) : NaN;
                const accuracy = payload ? Number(payload.accuracy) : NaN;

                if (!sessionId) {
                    if (
                        isFiniteNumber(latitude) &&
                        isFiniteNumber(longitude) &&
                        latitude >= -90 &&
                        latitude <= 90 &&
                        longitude >= -180 &&
                        longitude <= 180 &&
                        isFiniteNumber(accuracy) &&
                        accuracy > 0
                    ) {
                        Student.updateOne(
                            { _id: socket.data.studentId },
                            {
                                $set: {
                                    lastLocation: {
                                        latitude: latitude,
                                        longitude: longitude,
                                        accuracy: accuracy,
                                        updatedAt: new Date()
                                    }
                                }
                            }
                        ).catch(function () {});
                    }
                    return;
                }

                if (
                    !isFiniteNumber(latitude) ||
                    !isFiniteNumber(longitude) ||
                    latitude < -90 ||
                    latitude > 90 ||
                    longitude < -180 ||
                    longitude > 180
                ) {
                    return;
                }

                // Allow a 2-minute grace window after endTime in case of clock skew
                // or a teacher who forgot to close the session
                const locationGraceEnd = new Date(Date.now() - 2 * 60 * 1000);

                const session = await AttendanceSession.findOne({
                    _id: sessionId,
                    isActive: true,
                    status: "ACTIVE",
                    endTime: { $gt: locationGraceEnd }
                }).select("_id teacher classGroup latitude longitude radius teacherGpsAccuracy endTime");

                if (!session || !session.teacher || !session.classGroup) {
                    return;
                }

                if (
                    socket.data.classGroupId &&
                    session.classGroup.toString() !== socket.data.classGroupId
                ) {
                    return;
                }

                const centerLat = Number(session.latitude || 0);
                const centerLon = Number(session.longitude || 0);
                const radius = Number(session.radius || 0);
                const teacherGpsAccuracy = Number(session.teacherGpsAccuracy || 0);

                if (!isFiniteNumber(centerLat) || !isFiniteNumber(centerLon) || radius <= 0) {
                    return;
                }

                const peerSnapshot = liveLocationStore.getSnapshot(session._id);

                const locationMeta = payload && payload.locationMeta ? payload.locationMeta : null;

                function evaluateAtCoordinates(checkLat, checkLon) {
                    return evaluateLocationRange(
                        centerLat,
                        centerLon,
                        checkLat,
                        checkLon,
                        radius,
                        accuracy,
                        teacherGpsAccuracy,
                        {
                            studentLocationMeta: locationMeta,
                            teacherLocationMeta: session.locationMeta || null,
                            logContext: "socket-live-location"
                        }
                    );
                }

                let evaluation = evaluateAtCoordinates(latitude, longitude);

                const calibrated = gpsPeerCalibration.applyPeerCalibration(
                    evaluation,
                    centerLat,
                    centerLon,
                    latitude,
                    longitude,
                    radius,
                    accuracy,
                    teacherGpsAccuracy,
                    peerSnapshot,
                    socket.data.studentId,
                    function (snapLat, snapLon) {
                        return evaluateAtCoordinates(snapLat, snapLon);
                    }
                );

                evaluation = calibrated.evaluation;

                let displayLat = calibrated.displayLatitude;
                let displayLon = calibrated.displayLongitude;
                const distance = evaluation.measuredDistance;
                const inside = !evaluation.isOutside;
                const studentStatus =
                    evaluation.isAccuracyPoor && !evaluation.isOutside
                        ? "POOR_ACCURACY"
                        : evaluation.status;

                // Visual snap: if they are physically verified as INSIDE the room, 
                // their GPS difference from the teacher is purely noise.
                // Snap them to the teacher's exact location to match physical reality.
                if (studentStatus === "INSIDE") {
                    // Add a tiny deterministic micro-jitter (~2m) based on their ID
                    // so the markers form a tight cluster around the teacher instead 
                    // of perfectly overlapping and hiding each other.
                    const seed = socket.data.studentId || "default";
                    let hash = 0;
                    for (let i = 0; i < seed.length; i++) {
                        hash = (hash << 5) - hash + seed.charCodeAt(i);
                        hash |= 0;
                    }
                    const jitterLat = ((Math.abs(hash) % 100) / 100) * 0.00004 - 0.00002;
                    const jitterLon = ((Math.abs(hash >> 3) % 100) / 100) * 0.00004 - 0.00002;

                    displayLat = centerLat + jitterLat;
                    displayLon = centerLon + jitterLon;
                }

                const eventPayload = {
                    sessionId: session._id.toString(),
                    studentId: socket.data.studentId || "",
                    studentName: socket.data.studentName || "",
                    enrollmentNumber: socket.data.enrollmentNumber || "",
                    deviceId: deviceId || "default",
                    deviceLabel: deviceLabel || "Device",
                    latitude: displayLat,
                    longitude: displayLon,
                    rawLatitude: calibrated.rawLatitude,
                    rawLongitude: calibrated.rawLongitude,
                    gpsCorrected: Boolean(calibrated.adjusted),
                    accuracy: isFiniteNumber(accuracy) ? accuracy : null,
                    distance: Math.round(distance),
                    distanceLabel: evaluation.distanceLabel || "",
                    configuredRadius: Math.round(evaluation.configuredRadius),
                    effectiveRadius: Math.round(evaluation.effectiveRadius),
                    uncertaintyAllowance: Math.round(evaluation.uncertaintyAllowance),
                    inside: inside,
                    status: studentStatus,
                    reasonCode: evaluation.reasonCode,
                    updatedAt: new Date(),
                    online: true
                };

                liveLocationStore.upsertDevice(session._id, eventPayload, socket.id);

                if (!socket.data.trackedSessionIds) {
                    socket.data.trackedSessionIds = [];
                }

                const trackedId = session._id.toString();

                if (socket.data.trackedSessionIds.indexOf(trackedId) === -1) {
                    socket.data.trackedSessionIds.push(trackedId);
                }

                rememberTrackedDevice(
                    socket,
                    trackedId,
                    eventPayload.studentId,
                    eventPayload.deviceId
                );

                persistLiveDeviceLocation(eventPayload).catch(function (persistErr) {
                    console.log("LIVE LOCATION PERSIST ERROR:");
                    console.log(persistErr.message);
                });

                const teacherId = session.teacher.toString();
                io.to(getTeacherRoom(teacherId)).emit("student:location:update", eventPayload);
                io.to(getSessionRoom(session._id)).emit("student:location:update", eventPayload);
            } catch (err) {
                console.log("SOCKET STUDENT LOCATION UPDATE ERROR:");
                console.log(err.message);
            }
        });
    });
}

function getIO() {
    return ioInstance;
}

function emitAttendanceStarted(session, scheduleItem) {
    const io = getIO();

    if (!io || !session || !scheduleItem) {
        return;
    }

    const classGroupId = getId(session.classGroup || scheduleItem.classGroup);

    if (!classGroupId) {
        return;
    }

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule || scheduleItem._id),
        classGroupId: classGroupId,
        subjectId: getId(session.subject || scheduleItem.subject),
        teacherId: getId(session.teacher || scheduleItem.teacher),
        classroomId: getId(session.classroom || scheduleItem.classroom),
        collegeId: getId(session.college || (scheduleItem.classGroup ? scheduleItem.classGroup.college : "")),
        subjectName: scheduleItem.subject ? scheduleItem.subject.subjectName : "Subject",
        classGroupName: scheduleItem.classGroup ? scheduleItem.classGroup.name : "Class",
        classroomName: scheduleItem.classroom ? scheduleItem.classroom.classroomName : "Classroom",
        latitude: Number(session.latitude || 0),
        longitude: Number(session.longitude || 0),
        teacherGpsAccuracy: Number(session.teacherGpsAccuracy || 0),
        startTime: session.startTime,
        endTime: session.endTime,
        scheduledEndTime: session.scheduledEndTime || null,
        radius: session.radius,
        configuredRadius: Number(session.radius || 0),
        effectiveRadius: computeVerificationRadius(
            session.radius,
            0,
            session.teacherGpsAccuracy || 0
        ).verificationRadius,
        isReopen: Boolean(session.__isReopen)
    };

    io.to(getClassGroupRoom(classGroupId)).emit("attendance:started", payload);

    io.to(getTeacherRoom(getId(session.teacher || scheduleItem.teacher))).emit(
        "attendance:started:teacher",
        payload
    );

    if (payload.collegeId) {
        io.to(getAdminCollegeRoom(payload.collegeId)).emit("attendance:started:admin", payload);
    }
}

function emitAttendanceReopened(session, scheduleItem) {
    const io = getIO();

    if (!io || !session || !scheduleItem) {
        return;
    }

    const classGroupId = getId(session.classGroup || scheduleItem.classGroup);

    if (!classGroupId) {
        return;
    }

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule || scheduleItem._id),
        classGroupId: classGroupId,
        subjectId: getId(session.subject || scheduleItem.subject),
        teacherId: getId(session.teacher || scheduleItem.teacher),
        subjectName: scheduleItem.subject ? scheduleItem.subject.subjectName : "Subject",
        status: "ACTIVE",
        canMarkAttendance: true,
        message: "Attendance has been reopened. You can mark your attendance now.",
        reopenedAt: new Date(),
        effectiveEndTime: session.endTime || null,
        isReopen: true
    };

    // Emit both the dedicated reopen event AND the started event so all listeners catch it
    io.to(getClassGroupRoom(classGroupId)).emit("attendance:reopened", payload);
    const teacherPayload = Object.assign({}, payload, {
        latitude: Number(session.latitude || 0),
        longitude: Number(session.longitude || 0),
        teacherGpsAccuracy: Number(session.teacherGpsAccuracy || 0),
        startTime: session.startTime,
        endTime: session.endTime,
        radius: session.radius
    });

    io.to(getClassGroupRoom(classGroupId)).emit("attendance:started", teacherPayload);

    const teacherId = getId(session.teacher || scheduleItem.teacher);
    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:started:teacher", teacherPayload);
    }

    const collegeId = getId(session.college);
    if (collegeId) {
        io.to(getAdminCollegeRoom(collegeId)).emit("attendance:started:admin", payload);
    }
}

function emitAttendanceRecordUpdated(session, student, attendanceRecord) {
    const io = getIO();

    if (!io || !session || !student || !attendanceRecord) {
        return;
    }

    const teacherId = getId(session.teacher);
    const collegeId = getId(session.college);

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule),
        studentId: getId(student._id),
        studentName: student.fullName || "Student",
        enrollmentNumber: student.enrollmentNumber || "",
        oldStatus: "ABSENT",
        newStatus: attendanceRecord.status || "PRESENT",
        attendanceRecordId: getId(attendanceRecord._id),
        presentCount: session.attendanceSummary ? session.attendanceSummary.totalPresent : 0,
        absentCount: session.attendanceSummary ? session.attendanceSummary.totalAbsent : 0,
        totalMarked: session.attendanceSummary ? session.attendanceSummary.totalMarked : 0,
        message: "Attendance marked present.",
        updatedAt: new Date()
    };

    // Notify the student themselves
    io.to(getStudentRoom(student._id)).emit("attendance:record-updated", payload);

    // Notify teacher live dashboard
    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:record-updated", payload);
    }

    // Notify admin (best-effort)
    if (collegeId) {
        io.to(getAdminCollegeRoom(collegeId)).emit("attendance:record-updated", payload);
    }

    // Push notification to student
    setTimeout(async () => {
        try {
            const webpush = require("web-push");
            if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                webpush.setVapidDetails(
                    "mailto:harshkoli@example.com",
                    process.env.VAPID_PUBLIC_KEY,
                    process.env.VAPID_PRIVATE_KEY
                );
                const stu = await Student.findById(student._id || student).select("pushSubscriptions");
                if (stu && stu.pushSubscriptions && stu.pushSubscriptions.length > 0) {
                    const status = attendanceRecord && attendanceRecord.status ? attendanceRecord.status : "PRESENT";
                    let title = "Attendance Updated";
                    let body = `Your attendance has been marked ${status}.`;
                    
                    if (status === "PRESENT") {
                        title = "Marked Present";
                        body = "Your attendance has been marked as PRESENT.";
                    } else if (status === "ABSENT") {
                        title = "Marked Absent";
                        body = "Your attendance has been marked as ABSENT.";
                    }
                    
                    const notificationPayload = JSON.stringify({
                        title: title,
                        body: body,
                        icon: "/img/attendify-icon.png",
                        url: "/student/dashboard"
                    });
                    
                    await Promise.all(stu.pushSubscriptions.map(sub => 
                        webpush.sendNotification(sub, notificationPayload).catch(e => {})
                    ));
                }
            }
        } catch(e) { console.log("Push error:", e.message); }
    }, 100);
}

function emitAttendanceEnded(session) {
    const io = getIO();

    if (!io || !session) {
        return;
    }

    const sessionId = getId(session._id);
    if (!sessionId) return;
    
    // Clear the memory leak!
    liveLocationStore.clearSession(sessionId);

    const classGroupId = getId(session.classGroup);
    const teacherId = getId(session.teacher);
    const collegeId = getId(session.college);

    const payload = {
        sessionId: sessionId,
        scheduleId: getId(session.schedule),
        classGroupId: classGroupId,
        subjectId: getId(session.subject),
        teacherId: teacherId,
        collegeId: collegeId,
        status: session.status,
        absencesFinalized: Boolean(session.absentsMarkedAt),
        absentsMarkedAt: session.absentsMarkedAt || null,
        closedAt: session.closedAt || null,
        totalPresent: session.attendanceSummary ? session.attendanceSummary.totalPresent : 0,
        totalAbsent: session.attendanceSummary ? session.attendanceSummary.totalAbsent : 0,
        totalMarked: session.attendanceSummary ? session.attendanceSummary.totalMarked : 0
    };

    if (classGroupId) {
        io.to(getClassGroupRoom(classGroupId)).emit("attendance:ended", payload);
    }

    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:ended:teacher", payload);
    }

    if (collegeId) {
        io.to(getAdminCollegeRoom(collegeId)).emit("attendance:ended:admin", payload);
    }

    liveLocationStore.clearSession(getId(session._id));
    AttendanceSession.updateOne(
        { _id: getId(session._id), liveDevices: { $exists: true, $ne: [] } },
        {
            $set: {
                "liveDevices.$[].online": false
            }
        }
    ).catch(function () {
        // best-effort cleanup for persisted live-device status
    });
}

function emitAttendanceMarked(session, student, attendanceRecord, distance) {
    const io = getIO();

    if (!io || !session || !student) {
        return;
    }

    const teacherId = getId(session.teacher);

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule),
        studentId: getId(student._id),
        studentName: student.fullName,
        enrollmentNumber: student.enrollmentNumber,
        attendanceRecordId: attendanceRecord ? getId(attendanceRecord._id) : "",
        status: attendanceRecord && attendanceRecord.status ? attendanceRecord.status : "PRESENT",
        distance: Math.round(distance || 0),
        totalPresent: session.presentStudents ? session.presentStudents.length : 0,
        totalAbsent: session.absentStudents ? session.absentStudents.length : 0,
        totalMarked: session.attendanceSummary ? session.attendanceSummary.totalMarked : 0,
        markedAt: new Date()
    };

    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:marked", payload);
    }

    io.to(getStudentRoom(student._id)).emit("attendance:marked:self", payload);

    // Push notification to student
    setTimeout(async () => {
        try {
            const webpush = require("web-push");
            if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                webpush.setVapidDetails(
                    "mailto:harshkoli@example.com",
                    process.env.VAPID_PUBLIC_KEY,
                    process.env.VAPID_PRIVATE_KEY
                );
                const stu = await Student.findById(student._id || student).select("pushSubscriptions");
                if (stu && stu.pushSubscriptions && stu.pushSubscriptions.length > 0) {
                    const status = attendanceRecord && attendanceRecord.status ? attendanceRecord.status : "PRESENT";
                    let title = "Attendance Marked";
                    let body = `You successfully marked your attendance as ${status}.`;
                    
                    const notificationPayload = JSON.stringify({
                        title: title,
                        body: body,
                        icon: "/img/attendify-icon.png",
                        url: "/student/dashboard"
                    });
                    
                    await Promise.all(stu.pushSubscriptions.map(sub => 
                        webpush.sendNotification(sub, notificationPayload).catch(e => {})
                    ));
                }
            }
        } catch(e) { console.log("Push error:", e.message); }
    }, 100);
}

function emitSuspiciousAttendanceAttempt(attempt) {
    const io = getIO();

    if (!io || !attempt) {
        return;
    }

    const teacherId = getId(attempt.teacher);

    if (!teacherId) {
        return;
    }

    const payload = {
        attemptId: getId(attempt._id),
        sessionId: getId(attempt.attendanceSession),
        scheduleId: getId(attempt.schedule),
        studentId: getId(attempt.student),
        studentName: attempt.studentName || "Unknown Student",
        enrollmentNumber: attempt.enrollmentNumber || "Unknown",
        reasonCode: attempt.reasonCode || "UNKNOWN",
        reasonMessage: attempt.reasonMessage || "Suspicious attendance attempt.",
        result: attempt.result || "REJECTED",
        distanceFromTeacher: Math.round(attempt.distanceFromTeacher || 0),
        allowedRadius: Math.round(attempt.allowedRadius || 0),
        gpsAccuracy: Math.round(attempt.gpsAccuracy || 0),
        maxAllowedAccuracy: Math.round(attempt.maxAllowedAccuracy || 100),
        createdAt: attempt.createdAt || new Date()
    };

    io.to(getTeacherRoom(teacherId)).emit("attendance:suspicious", payload);
}

function emitScheduleChanged(payload) {
    const io = getIO();

    if (!io || !payload) {
        return;
    }

    const safePayload = {
        reason: payload.reason || "updated",
        scheduleId: payload.scheduleId ? payload.scheduleId.toString() : "",
        classGroupId: payload.classGroupId ? payload.classGroupId.toString() : "",
        teacherId: payload.teacherId ? payload.teacherId.toString() : "",
        collegeId: payload.collegeId ? payload.collegeId.toString() : "",
        changedAt: new Date()
    };

    if (safePayload.classGroupId) {
        io.to(getClassGroupRoom(safePayload.classGroupId)).emit("schedule:changed", safePayload);
    }

    if (safePayload.teacherId) {
        io.to(getTeacherRoom(safePayload.teacherId)).emit("schedule:changed", safePayload);
    }

    if (safePayload.collegeId) {
        io.to(getAdminCollegeRoom(safePayload.collegeId)).emit("schedule:changed", safePayload);
    }

    io.to(getPlatformAdminRoom()).emit("schedule:changed", safePayload);
}

function emitNotification(notificationPayload) {
    const io = getIO();

    if (!io || !notificationPayload) {
        return;
    }

    const role = (notificationPayload.recipientRole || "").toUpperCase();

    if (role === "STUDENT" && notificationPayload.recipientUserId) {
        io.to(getStudentRoom(notificationPayload.recipientUserId)).emit(
            "notification:new",
            notificationPayload
        );
        return;
    }

    if (role === "TEACHER" && notificationPayload.recipientUserId) {
        io.to(getTeacherRoom(notificationPayload.recipientUserId)).emit(
            "notification:new",
            notificationPayload
        );
        return;
    }

    if (role === "ADMIN") {
        if (notificationPayload.recipientUserId) {
            io.to(getTeacherRoom(notificationPayload.recipientUserId)).emit(
                "notification:new",
                notificationPayload
            );
            return;
        }

        if (notificationPayload.collegeId) {
            io.to(getAdminCollegeRoom(notificationPayload.collegeId)).emit(
                "notification:new",
                notificationPayload
            );
        }
        return;
    }

    if (role === "PLATFORM_ADMIN") {
        io.to(getPlatformAdminRoom()).emit("notification:new", notificationPayload);
    }
}

function emitNotificationUnreadCount(payload) {
    const io = getIO();

    if (!io || !payload) {
        return;
    }

    const role = (payload.recipientRole || "").toUpperCase();
    const countPayload = {
        recipientRole: role,
        unreadCount: Number(payload.unreadCount || 0)
    };

    if (role === "STUDENT" && payload.recipientUserId) {
        io.to(getStudentRoom(payload.recipientUserId)).emit("notification:unread-count", countPayload);
        return;
    }

    if (role === "TEACHER" && payload.recipientUserId) {
        io.to(getTeacherRoom(payload.recipientUserId)).emit("notification:unread-count", countPayload);
        return;
    }

    if (role === "ADMIN") {
        if (payload.recipientUserId) {
            io.to(getTeacherRoom(payload.recipientUserId)).emit("notification:unread-count", countPayload);
            return;
        }

        if (payload.collegeId) {
            io.to(getAdminCollegeRoom(payload.collegeId)).emit("notification:unread-count", countPayload);
        }
        return;
    }

    if (role === "PLATFORM_ADMIN") {
        io.to(getPlatformAdminRoom()).emit("notification:unread-count", countPayload);
    }
}

function emitPasskeyStateChanged(studentId, payload) {
    const io = getIO();
    if (!io || !studentId) return;
    io.to(getStudentRoom(studentId)).emit("student:passkey-state-changed", payload);
}

function emitStudentApproved(studentId, collegeId) {
    const io = getIO();
    if (!io || !studentId) return;
    io.to(getWaitingStudentRoom(studentId)).emit("student:approved", { studentId });
    if (collegeId) {
        io.to(getAdminCollegeRoom(collegeId)).emit("admin:studentApproved", { studentId });
    }
}

function emitStudentRejected(studentId, collegeId) {
    const io = getIO();
    if (!io || !studentId || !collegeId) return;
    io.to(getAdminCollegeRoom(collegeId)).emit("admin:studentRejected", { studentId });
}

function emitNewRegistration(collegeId, studentData) {
    const io = getIO();
    if (!io || !collegeId || !studentData) return;
    io.to(getAdminCollegeRoom(collegeId)).emit("admin:newRegistration", studentData);
}

function emitAttendancePendingReview(session, student, record) {
    const io = getIO();
    if (!io || !session || !student || !record) return;

    io.to(getSessionRoom(session._id)).emit("attendance:pending-review", {
        studentId: student._id.toString(),
        fullName: student.fullName,
        enrollmentNumber: student.enrollmentNumber,
        recordId: record._id.toString(),
        confidenceScore: record.confidenceScore || 0,
        distance: record.finalDistance || null,
        accuracy: record.finalAccuracy || null,
        verificationMethod: record.verificationMethod
    });
}

function emitAttendanceReviewDecision(session, student, payload) {
    const io = getIO();
    if (!io || !session || !student) return;

    const data = {
        studentId: student._id.toString(),
        decision: payload.decision,
        reason: payload.reason || "",
        recordId: payload.record ? payload.record._id.toString() : null
    };

    io.to(getStudentRoom(student._id)).emit("attendance:review-decision", data);
    io.to(getSessionRoom(session._id)).emit("attendance:review-decision", data);
}

function emitRetryRequested(sessionId, studentId) {
    const io = getIO();
    if (!io || !sessionId || !studentId) return;

    io.to(getStudentRoom(studentId)).emit("attendance:retry-requested", {
        sessionId: sessionId.toString()
    });
}

module.exports = {
    initializeSocket,
    getIO,
    emitAttendanceStarted,
    emitAttendanceEnded,
    emitAttendanceMarked,
    emitAttendanceReopened,
    emitAttendanceRecordUpdated,
    emitSuspiciousAttendanceAttempt,
    emitScheduleChanged,
    emitNotification,
    emitNotificationUnreadCount,
    emitPasskeyStateChanged,
    emitStudentApproved,
    emitStudentRejected,
    emitNewRegistration,
    emitAttendancePendingReview,
    emitAttendanceReviewDecision,
    emitRetryRequested
};
