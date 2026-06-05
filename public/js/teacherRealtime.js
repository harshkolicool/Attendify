document.addEventListener("DOMContentLoaded", function init() {
    const config = window.AttendifyRealtimeConfig || { mode: "socket" };

    if (config.mode !== "socket") {
        window.addEventListener("attendify:poll-data", function (e) {
            const data = e.detail;
            if (!data) return;

            if (data.sessionStates && Array.isArray(data.sessionStates)) {
                // Keep track of active session IDs to detect closed sessions
                const activeSessionIds = data.sessionStates.map(function(s) { return s.sessionId; });

                // Mark sessions as closed if they are in the DOM but not in the active list
                const allLiveCards = document.querySelectorAll(".live-card:not(.session-ended)");
                for (let i = 0; i < allLiveCards.length; i++) {
                    const domSessionId = allLiveCards[i].getAttribute("data-session-id");
                    if (domSessionId && !activeSessionIds.includes(domSessionId)) {
                        allLiveCards[i].classList.add("session-ended");
                        const badge = allLiveCards[i].querySelector(".live-badge");
                        if (badge) {
                            badge.textContent = "CLOSED";
                        }
                    }
                }

                data.sessionStates.forEach(function (state) {
                    const card = document.querySelector(".live-card[data-session-id='" + state.sessionId + "']");
                    if (card) {
                        const countElement = card.querySelector(".js-live-present-count");
                        if (countElement) {
                            countElement.textContent = state.presentCount;
                        }

                        // Update student list dynamically
                        if (state.presentStudents && Array.isArray(state.presentStudents)) {
                            const list = card.querySelector(".js-live-student-list");
                            if (list) {
                                state.presentStudents.forEach(function(studentSnapshot) {
                                    // Check if student is already in the list
                                    const existingItems = list.querySelectorAll(".student-info strong");
                                    let found = false;
                                    for (let i = 0; i < existingItems.length; i++) {
                                        if (existingItems[i].textContent === studentSnapshot.fullName) {
                                            found = true;
                                            break;
                                        }
                                    }

                                    if (!found) {
                                        const emptyState = list.querySelector(".empty-student-card");
                                        if (emptyState) emptyState.remove();

                                        const item = document.createElement("li");
                                        item.className = "student-card-item";

                                        const studentNameStr = studentSnapshot.fullName || "Unknown Student";
                                        const initial = studentNameStr.charAt(0).toUpperCase();

                                        const avatar = document.createElement("div");
                                        avatar.className = "student-avatar";
                                        avatar.textContent = initial;

                                        const infoBox = document.createElement("div");
                                        infoBox.className = "student-info";

                                        const studentName = document.createElement("strong");
                                        studentName.textContent = studentNameStr;

                                        const enrollmentNumber = document.createElement("span");
                                        enrollmentNumber.textContent = studentSnapshot.enrollmentNumber || "Unknown";

                                        infoBox.appendChild(studentName);
                                        infoBox.appendChild(enrollmentNumber);

                                        const statusIconBox = document.createElement("div");
                                        statusIconBox.className = "student-status-icon";
                                        
                                        const checkIcon = document.createElement("i");
                                        checkIcon.className = "fa-solid fa-check";
                                        statusIconBox.appendChild(checkIcon);

                                        item.appendChild(avatar);
                                        item.appendChild(infoBox);
                                        item.appendChild(statusIconBox);

                                        list.prepend(item);
                                    }
                                });
                            }
                        }
                    }
                });
            }

            if (data.recentSuspiciousAttempts) {
                // Suspicious attempts are fetched directly by loadRecentSuspiciousAttempts, 
                // but we can also use this data if we want.
                if (Array.isArray(data.recentSuspiciousAttempts)) {
                    data.recentSuspiciousAttempts.reverse().forEach(function (attempt) {
                        addSuspiciousAttempt(attempt, true);
                    });
                }
            }
        });

        loadRecentSuspiciousAttempts();
        return;
    }

    if (typeof io === "undefined") {
        setTimeout(init, 50);
        return;
    }

    const socket =
        window.AttendifySharedSocket ||
        io({
            transports: ["websocket", "polling"],
            withCredentials: true,
            timeout: 20000,
            reconnectionAttempts: 20,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        });
    window.AttendifySharedSocket = socket;

    if (socket.__teacherRealtimeAttached === true) {
        return;
    }

    socket.__teacherRealtimeAttached = true;
    window.__attendifyRoleSpecificRealtime = true;

    function joinTeacherRealtime() {
        socket.emit("teacher:join");
    }

    socket.on("connect", function () {
        connectErrorShown = false;
        joinTeacherRealtime();
        
        // Re-fetch state on reconnect to recover missed events
        fetch("/teacher/realtime/poll", { method: "GET", credentials: "same-origin" })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data && data.success && data.sessionStates) {
                    window.dispatchEvent(new CustomEvent("attendify:poll-data", { detail: data }));
                }
            })
            .catch(function() {});
    });

    if (socket.connected) {
        joinTeacherRealtime();
    }


    function findLiveCard(sessionId) {
        return document.querySelector(".live-card[data-session-id='" + sessionId + "']");
    }

    function createIcon(className) {
        const icon = document.createElement("i");
        icon.className = className;
        return icon;
    }

    function createMetaSpan(iconClass, text) {
        const span = document.createElement("span");
        span.appendChild(createIcon(iconClass));
        span.appendChild(document.createTextNode(" " + text));
        return span;
    }

    function showTeacherToast(message, type) {
        let toast = document.getElementById("teacherRealtimeToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "teacherRealtimeToast";
            toast.className = "teacher-realtime-toast";
            document.body.appendChild(toast);
        }

        toast.textContent = message || "";

        toast.classList.remove("danger");

        if (type === "danger") {
            toast.classList.add("danger");
        }

        toast.classList.add("show");

        setTimeout(function () {
            toast.classList.remove("show");
        }, 4000);
    }

    socket.on("socket:error", function (payload) {
        if (!payload || !payload.message) {
            return;
        }

        showTeacherToast(payload.message, "danger");
    });

    let connectErrorShown = false;
    socket.on("connect_error", function () {
        if (!connectErrorShown) {
            showTeacherToast("Realtime temporarily unavailable. The page will keep updating automatically.", "danger");
            connectErrorShown = true;
        }
    });

    function formatTime(dateValue) {
        if (!dateValue) {
            return "Just now";
        }

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Just now";
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getReasonLabel(reasonCode, reasonMessage) {
        const labels = {
            OUTSIDE_RADIUS: "Outside allowed radius",
            LOW_GPS_ACCURACY: "Poor GPS accuracy",
            TOKEN_INVALID: "Invalid security token",
            SESSION_CLOSED: "Session closed",
            SESSION_EXPIRED: "Session expired",
            COLLEGE_MISMATCH: "Wrong college",
            CLASS_GROUP_MISMATCH: "Wrong class group",
            ALREADY_MARKED: "Already marked",
            TEACHER_LOCATION_MISSING: "Teacher location missing",
            CLASSROOM_LOCATION_MISSING: "Attendance location missing",
            DUPLICATE_ATTENDANCE: "Duplicate attendance",
            SERVER_ERROR: "Server error"
        };

        return labels[reasonCode] || reasonMessage || "Suspicious attempt";
    }

    function updateSuspiciousCount() {
        const list = document.getElementById("suspiciousAttemptList");
        const countPill = document.getElementById("suspiciousAttemptCount");
        const emptyState = document.getElementById("suspiciousEmptyState");

        if (!list || !countPill) {
            return;
        }

        const count = list.querySelectorAll("li").length;

        countPill.textContent = count + (count === 1 ? " Alert" : " Alerts");

        if (emptyState) {
            emptyState.style.display = count > 0 ? "none" : "flex";
        }
    }

    function addSuspiciousAttempt(payload, prepend) {
        const list = document.getElementById("suspiciousAttemptList");

        if (!list || !payload) {
            return;
        }

        if (payload.attemptId) {
            const existingItem = list.querySelector("[data-attempt-id='" + payload.attemptId + "']");

            if (existingItem) {
                return;
            }
        }

        const item = document.createElement("li");
        item.className = "suspicious-attempt-item";
        item.setAttribute("data-attempt-id", payload.attemptId || "");

        const top = document.createElement("div");
        top.className = "suspicious-attempt-top";

        const studentBox = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = payload.studentName || "Unknown Student";

        const enrollment = document.createElement("small");
        enrollment.textContent = payload.enrollmentNumber || "Unknown";

        studentBox.appendChild(name);
        studentBox.appendChild(enrollment);

        const time = document.createElement("span");
        time.className = "suspicious-time";
        time.textContent = formatTime(payload.createdAt);

        top.appendChild(studentBox);
        top.appendChild(time);

        const reason = document.createElement("p");
        reason.textContent = getReasonLabel(payload.reasonCode, payload.reasonMessage);

        const meta = document.createElement("div");
        meta.className = "suspicious-meta";

        if (payload.distanceFromTeacher && Number(payload.distanceFromTeacher) > 0) {
            meta.appendChild(
                createMetaSpan(
                    "fa-solid fa-location-arrow",
                    Number(payload.distanceFromTeacher) + "m away"
                )
            );
        }

        if (payload.allowedRadius && Number(payload.allowedRadius) > 0) {
            meta.appendChild(
                createMetaSpan(
                    "fa-solid fa-circle-dot",
                    "Radius " + Number(payload.allowedRadius) + "m"
                )
            );
        }

        if (payload.gpsAccuracy && Number(payload.gpsAccuracy) > 0) {
            meta.appendChild(
                createMetaSpan(
                    "fa-solid fa-crosshairs",
                    "Accuracy " + Number(payload.gpsAccuracy) + "m"
                )
            );
        }

        item.appendChild(top);
        item.appendChild(reason);
        item.appendChild(meta);

        if (prepend) {
            list.prepend(item);
        } else {
            list.appendChild(item);
        }

        while (list.querySelectorAll("li").length > 10) {
            list.removeChild(list.lastElementChild);
        }

        updateSuspiciousCount();
    }

    function loadRecentSuspiciousAttempts() {
        const list = document.getElementById("suspiciousAttemptList");

        if (!list) {
            return;
        }

        fetch("/teacher/suspicious-attempts/recent", {
            method: "GET",
            credentials: "same-origin"
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.attempts)) {
                    updateSuspiciousCount();
                    return;
                }

                data.attempts.reverse().forEach(function (attempt) {
                    addSuspiciousAttempt(attempt, false);
                });

                updateSuspiciousCount();
            })
            .catch(function (err) {
                console.log("Recent suspicious attempts load error:", err);
                updateSuspiciousCount();
            });
    }

    socket.on("attendance:marked", function (payload) {
        const card = findLiveCard(payload.sessionId);

        if (card) {
            const countElement = card.querySelector(".js-live-present-count");

            if (countElement) {
                countElement.textContent = payload.totalPresent || 0;
            }

            const list = card.querySelector(".js-live-student-list");

            if (list) {
                const emptyState = list.querySelector(".empty-student-card");
                if (emptyState) {
                    emptyState.remove();
                }

                const item = document.createElement("li");
                item.className = "student-card-item";

                const studentNameStr = payload.studentName || "Unknown Student";
                const initial = studentNameStr.charAt(0).toUpperCase();

                const avatar = document.createElement("div");
                avatar.className = "student-avatar";
                avatar.textContent = initial;

                const infoBox = document.createElement("div");
                infoBox.className = "student-info";

                const studentName = document.createElement("strong");
                studentName.textContent = studentNameStr;

                const enrollmentNumber = document.createElement("span");
                enrollmentNumber.textContent = payload.enrollmentNumber || "Unknown";

                infoBox.appendChild(studentName);
                infoBox.appendChild(enrollmentNumber);

                const statusIconBox = document.createElement("div");
                statusIconBox.className = "student-status-icon";
                
                const checkIcon = document.createElement("i");
                checkIcon.className = "fa-solid fa-check";
                statusIconBox.appendChild(checkIcon);

                item.appendChild(avatar);
                item.appendChild(infoBox);
                item.appendChild(statusIconBox);

                list.prepend(item);
            }
        }

        showTeacherToast(
            (payload.studentName || "Student") + " marked attendance",
            "success"
        );
    });

    socket.on("attendance:ended:teacher", function (payload) {
        const card = findLiveCard(payload.sessionId);

        if (card) {
            card.classList.add("session-ended");

            const badge = card.querySelector(".live-badge");

            if (badge) {
                badge.textContent = "CLOSED";
            }
        }

        showTeacherToast("Attendance session closed", "success");
    });

    socket.on("attendance:suspicious", function (payload) {
        addSuspiciousAttempt(payload, true);

        showTeacherToast(
            "Suspicious attempt: " +
            (payload.studentName || "Student") +
            " - " +
            getReasonLabel(payload.reasonCode, payload.reasonMessage),
            "danger"
        );
    });



    loadRecentSuspiciousAttempts();
});
