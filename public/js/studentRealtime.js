document.addEventListener("DOMContentLoaded", function () {
    const config = window.AttendifyRealtimeConfig || { mode: "socket" };

    if (config.mode !== "socket") {
        // In polling mode, listen to the data from uiShell.js and update cards if needed
        window.addEventListener("attendify:poll-data", function (e) {
            const data = e.detail;
            if (!data || !data.attendanceStates) return;

            if (data.attendanceStates && Array.isArray(data.attendanceStates)) {
                data.attendanceStates.forEach(function (stateObj) {
                    const card = getScheduleCard(stateObj.scheduleId);
                    if (card) {
                        const currentState = card.getAttribute("data-attendance-state");
                        if (stateObj.state === "present" && currentState !== "present") {
                            setPresentUI(card);
                        } else if (stateObj.state === "live" && currentState !== "present" && currentState !== "live") {
                            setLiveUI(card, stateObj.sessionId);
                        }
                    }
                });
            }

            // Sync other cards based on clock 
            syncOngoingCardsByClock();
        });

        syncOngoingCardsByClock();
        setInterval(syncOngoingCardsByClock, 30000);
        return;
    }

    if (typeof io === "undefined") {
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

    if (socket.__studentRealtimeAttached === true) {
        return;
    }

    socket.__studentRealtimeAttached = true;
    window.__attendifyRoleSpecificRealtime = true;

    function joinStudentRealtime() {
        socket.emit("student:join");
    }

    socket.on("connect", function () {
        joinStudentRealtime();

        // Re-fetch state on reconnect to recover missed events
        fetch("/student/realtime/poll", { method: "GET", credentials: "same-origin" })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data && data.success && data.attendanceStates) {
                    window.dispatchEvent(new CustomEvent("attendify:poll-data", { detail: data }));
                }
            })
            .catch(function() {});
    });

    if (socket.connected) {
        joinStudentRealtime();
    }

    function showRealtimeMessage(message, type) {
        if (typeof showMessage === "function") {
            showMessage(message, type || "success");
            return;
        }

        console.log(message);
    }

    socket.on("socket:error", function (payload) {
        if (!payload || !payload.message) {
            return;
        }

        showRealtimeMessage(payload.message, "error");
    });

    socket.on("connect_error", function () {
        showRealtimeMessage("Realtime temporarily unavailable. The page will keep updating automatically.", "error");
    });

    function getScheduleCard(scheduleId) {
        return document.querySelector("[data-schedule-id='" + scheduleId + "']");
    }

    function getActionBox(card) {
        if (!card) {
            return null;
        }

        return card.querySelector(".js-schedule-action");
    }

    function createStatusBadge(type, iconClass, text) {
        const badge = document.createElement("span");
        badge.className = "status-badge " + type;

        const icon = document.createElement("i");
        icon.className = iconClass;

        badge.appendChild(icon);
        badge.appendChild(document.createTextNode(" " + text));

        return badge;
    }

    function setTopStatusBadge(card, type, iconClass, text) {
        if (!card) {
            return;
        }

        const cardTop = card.querySelector(".class-card-top");

        if (!cardTop) {
            return;
        }

        const existingBadge = cardTop.querySelector(".status-badge");
        const newBadge = createStatusBadge(type, iconClass, text);

        if (existingBadge) {
            existingBadge.replaceWith(newBadge);
            return;
        }

        cardTop.appendChild(newBadge);
    }

    function createDisabledButton(text, variant) {
        const button = document.createElement("button");
        button.className = "view-btn";

        if (variant === "marked") {
            button.className += " marked";
        } else if (variant === "absent") {
            button.className += " marked absent";
        } else if (variant === "pending") {
            button.className += " pending";
        } else if (variant === "late") {
            button.className += " late";
        } else if (variant === "unmarked") {
            button.className += " unmarked";
        }

        button.type = "button";
        button.disabled = true;
        button.textContent = text;

        return button;
    }

    function timeToMinutes(timeText) {
        if (!timeText || typeof timeText !== "string") {
            return -1;
        }

        const text = timeText.trim().toUpperCase();
        const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

        if (!match) {
            return -1;
        }

        let hours = Number(match[1]);
        const minutes = Number(match[2]);
        const meridian = match[3];

        if (meridian === "PM" && hours !== 12) {
            hours += 12;
        }

        if (meridian === "AM" && hours === 12) {
            hours = 0;
        }

        return (hours * 60) + minutes;
    }

    function isTodayCard(card) {
        const dayOffsetText = card ? card.getAttribute("data-day-offset") : null;

        if (dayOffsetText === null || dayOffsetText === "") {
            return true;
        }

        return Number(dayOffsetText) === 0;
    }

    function isCardInLiveWindow(card) {
        if (!card || !isTodayCard(card)) {
            return false;
        }

        const startTime = card.getAttribute("data-start-time") || "";
        const endTime = card.getAttribute("data-end-time") || "";

        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);

        if (startMinutes < 0 || endMinutes < 0) {
            return false;
        }

        const now = new Date();
        const nowMinutes = (now.getHours() * 60) + now.getMinutes();

        return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }

    function isCardPastEnd(card) {
        if (!card || !isTodayCard(card)) {
            return false;
        }

        const endTime = card.getAttribute("data-end-time") || "";
        const endMinutes = timeToMinutes(endTime);

        if (endMinutes < 0) {
            return false;
        }

        const now = new Date();
        const nowMinutes = (now.getHours() * 60) + now.getMinutes();

        return nowMinutes > endMinutes;
    }

    function setPresentUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox || !card) {
            return;
        }

        card.setAttribute("data-attendance-state", "present");
        setTopStatusBadge(card, "present", "fa-solid fa-circle-check", "Present");

        actionBox.textContent = "";
        actionBox.appendChild(createDisabledButton("Attendance Marked", "marked"));
    }


    function setOngoingUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox || !card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Only PRESENT is truly final — all other states can transition
        if (currentState === "present" || currentState === "live") {
            return;
        }

        card.setAttribute("data-attendance-state", "ongoing");
        card.setAttribute("data-session-id", "");
        setTopStatusBadge(card, "live", "fa-solid fa-circle-dot", "Live Class");

        actionBox.textContent = "";
        actionBox.appendChild(createDisabledButton("Teacher Not Started"));
    }

    function setLiveUI(card, sessionId) {
        const actionBox = getActionBox(card);

        if (!actionBox) {
            return;
        }

        actionBox.textContent = "";

        card.setAttribute("data-attendance-state", "live");
        card.setAttribute("data-session-id", sessionId);

        setTopStatusBadge(
            card,
            "live",
            "fa-solid fa-circle-dot",
            "Live Class"
        );

        const button = document.createElement("button");
        button.className = "view-btn live js-mark-attendance-btn";
        button.type = "button";
        button.setAttribute("data-session-id", sessionId);
        button.textContent = "Mark Attendance";

        actionBox.appendChild(button);
    }

    function setWaitingUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox || !card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Only PRESENT and active live states are truly final
        if (currentState === "present" || currentState === "live") {
            return;
        }

        card.setAttribute("data-attendance-state", "waiting");
        card.setAttribute("data-session-id", "");
        setTopStatusBadge(card, "waiting", "fa-solid fa-clock", "Waiting");

        actionBox.textContent = "";
        actionBox.appendChild(createDisabledButton("Not Started"));
    }

    function setUnmarkedUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox || !card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Only PRESENT is truly final
        if (currentState === "present" || currentState === "live") {
            return;
        }

        card.setAttribute("data-attendance-state", "unmarked");
        card.setAttribute("data-session-id", "");
        setTopStatusBadge(card, "unmarked", "fa-solid fa-triangle-exclamation", "Unmarked");

        actionBox.textContent = "";
        actionBox.appendChild(createDisabledButton("Unmarked", "unmarked"));
    }

    function setPendingUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox || !card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Only PRESENT is truly final
        if (currentState === "present") {
            return;
        }

        card.setAttribute("data-attendance-state", "pending");
        card.setAttribute("data-session-id", "");
        setTopStatusBadge(card, "pending", "fa-solid fa-hourglass-half", "Pending");

        actionBox.textContent = "";
        actionBox.appendChild(createDisabledButton("Pending", "pending"));
    }

    function syncOngoingCardsByClock() {
        const cards = document.querySelectorAll("[data-schedule-id]");

        cards.forEach(function (card) {
            const currentState = card.getAttribute("data-attendance-state");

            if (
                currentState === "present" ||
                currentState === "live" ||
                currentState === "pending"
            ) {
                return;
            }

            if (!isTodayCard(card)) {
                return;
            }

            if (isCardInLiveWindow(card)) {
                setOngoingUI(card);
            } else if (isCardPastEnd(card)) {
                setUnmarkedUI(card);
            } else if (currentState === "ongoing" || currentState === "unmarked") {
                setWaitingUI(card);
            }
        });
    }

    function setAbsentUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox) {
            return;
        }

        // Note: We do NOT guard against currentState === "absent" here because
        // the card may need to be set to absent after being in another state.
        // The guard for present stays — once present, never go back to absent.
        const currentState = card.getAttribute("data-attendance-state");

        if (currentState === "present") {
            return;
        }

        actionBox.textContent = "";

        card.setAttribute("data-attendance-state", "absent");

        setTopStatusBadge(
            card,
            "absent",
            "fa-solid fa-circle-xmark",
            "Absent"
        );

        actionBox.appendChild(createDisabledButton("Marked Absent", "absent"));
    }

    socket.on("attendance:started", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Student already marked PRESENT — never override
        if (currentState === "present") {
            return;
        }

        // Student is ABSENT: teacher starting/reopening attendance means they can mark again
        // Always allow this transition — the server controls eligibility
        setLiveUI(card, payload.sessionId);

        if (payload.isReopen) {
            showRealtimeMessage(
                "Attendance reopened for " + (payload.subjectName || "this subject") + ". You can mark attendance now!",
                "success"
            );
        } else {
            showRealtimeMessage(
                "Attendance started for " + (payload.subjectName || "this subject") + ". You can mark now.",
                "success"
            );
        }
    });

    // Dedicated reopen event — always enables marking for non-present students
    socket.on("attendance:reopened", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        // Only PRESENT stays as-is; everyone else (absent, waiting, etc.) gets the button
        if (currentState === "present") {
            return;
        }

        setLiveUI(card, payload.sessionId);

        showRealtimeMessage(
            "Attendance reopened. You can now mark attendance!",
            "success"
        );
    });

    socket.on("attendance:ended", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        if (payload.absencesFinalized === true) {
            setAbsentUI(card);
            showRealtimeMessage("Attendance finalized. Missing students were marked absent.", "error");
            return;
        }

        if (
            currentState === "live" ||
            currentState === "ongoing" ||
            currentState === "waiting" ||
            currentState === "pending"
        ) {
            setPendingUI(card);
            showRealtimeMessage("Attendance session closed. Your status stays pending until class ends.", "success");
        }
    });

    socket.on("attendance:marked:self", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        // Always show PRESENT — LATE is not used in this attendance flow
        setPresentUI(card);
        showRealtimeMessage("Attendance marked successfully!", "success");

        // On the history page (not the dashboard), reload so table updates
        if (window.location.pathname.indexOf("/attendance-history") !== -1) {
            setTimeout(function () {
                window.location.reload();
            }, 2000);
        }
    });

    // Fired when AUTO_ABSENT is overridden to PRESENT
    socket.on("attendance:record-updated", function (payload) {
        if (!payload || payload.newStatus !== "PRESENT") {
            return;
        }

        // Update the schedule card to show "present"
        var card = getScheduleCard(payload.scheduleId);
        if (card) {
            setPresentUI(card);
        }

        // Update sidebar absent/present counters if they exist on the page
        // Use parseInt to strip " Classes" suffix safely
        var absentBadge = document.querySelector(".js-absent-count-today");
        if (absentBadge) {
            var current = parseInt(absentBadge.textContent, 10) || 0;
            if (current > 0) {
                absentBadge.textContent = (current - 1) + " Classes";
            }
        }

        var presentBadge = document.querySelector(".js-present-count-today");
        if (presentBadge) {
            var p = parseInt(presentBadge.textContent, 10) || 0;
            presentBadge.textContent = (p + 1) + " Classes";
        }

        showRealtimeMessage("Great! Your attendance has been marked present.", "success");

        // On history page, reload to refresh table
        if (window.location.pathname.indexOf("/attendance-history") !== -1) {
            setTimeout(function () {
                window.location.reload();
            }, 2000);
        }
    });

    syncOngoingCardsByClock();
    setInterval(syncOngoingCardsByClock, 30000);
});
