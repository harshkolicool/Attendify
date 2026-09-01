document.addEventListener("DOMContentLoaded", function () {
    const grid = document.getElementById("pending-grid");
    const emptyStateContainers = document.querySelectorAll(".js-empty-state-container");
    const countHeader = document.querySelector(".admin-card-header h2");
    const radarQueueVal = document.querySelector(".adm-radar-card .adm-radar-val");

    if (!grid) {
        return;
    }

    const socket =
        window.AttendifySharedSocket ||
        (typeof io !== "undefined"
            ? io({
                  transports: ["websocket", "polling"],
                  withCredentials: true,
                  timeout: 20000,
                  reconnectionAttempts: 20
              })
            : null);

    if (socket) {
        window.AttendifySharedSocket = socket;
        function joinAdmin() {
            socket.emit("admin:join");
        }
        socket.on("connect", joinAdmin);
        if (socket.connected) {
            joinAdmin();
        }
    }

    function escapeHTML(str) {
        if (!str) {
            return "";
        }

        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function hideEmptyStates() {
        emptyStateContainers.forEach(function (container) {
            container.classList.add("is-hidden");
            container.style.setProperty("display", "none", "important");
        });
    }

    function showEmptyStates() {
        emptyStateContainers.forEach(function (container) {
            container.classList.remove("is-hidden");
            container.style.removeProperty("display");
        });
    }

    function showGrid() {
        grid.classList.remove("is-hidden");
        grid.style.removeProperty("display");
    }

    function hideGrid() {
        grid.classList.add("is-hidden");
        grid.style.setProperty("display", "none", "important");
    }

    function updateCounts(count) {
        currentCount = Math.max(0, count);
        if (countHeader) {
            countHeader.innerHTML = '<i class="fa-solid fa-user-clock" style="color: #6366f1; margin-right: 8px;"></i> Students Awaiting Verification (' + currentCount + ')';
        }
        if (radarQueueVal) {
            radarQueueVal.textContent = currentCount + " Awaiting Review";
            radarQueueVal.style.color = currentCount > 0 ? "#f59e0b" : "#10b981";
        }
        if (currentCount === 0) {
            showEmptyStates();
            hideGrid();
        } else {
            hideEmptyStates();
            showGrid();
        }
    }

    function buildPendingStudentCard(student) {
        const studentId = escapeHTML(student._id || student.id);

        const card = document.createElement("article");
        card.className = "admin-item-card admin-student-card pending-card-enter";
        card.id = "student-card-" + studentId;

        const avatarUrl = "https://ui-avatars.com/api/?name=" + encodeURIComponent(student.fullName || "Student") + "&background=6366f1&color=fff&rounded=true&bold=true";

        card.innerHTML = `
            <div class="admin-item-top pending-student-top">
                <div class="pending-student-profile" style="display: flex; align-items: center; gap: 14px;">
                    <img
                        src="${avatarUrl}"
                        alt="${escapeHTML(student.fullName || "Student")}" 
                        class="pending-student-avatar"
                        style="width: 48px; height: 48px; border-radius: 50%; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);"
                    >
                    <div>
                        <h4 class="pending-student-name" style="margin: 0; font-size: 1.1rem; font-weight: 800;">${escapeHTML(student.fullName || "Student")}</h4>
                        <p class="pending-student-email" style="margin: 2px 0 0 0; font-size: 0.84rem; opacity: 0.7;">${escapeHTML(student.email || "")}</p>
                    </div>
                </div>
            </div>

            <div class="admin-student-body pending-student-body" style="margin-top: 14px;">
                <div class="admin-meta admin-student-meta pending-student-meta">
                    <span class="admin-badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1; font-weight: 700;">
                        <i class="fa-solid fa-hashtag"></i> ${escapeHTML(student.enrollmentNumber || "-")}
                    </span>
                    <span class="admin-badge" style="background: rgba(6, 182, 212, 0.12); color: #0891b2; font-weight: 700;">
                        <i class="fa-solid fa-building-columns"></i> ${escapeHTML(student.department || "-")}
                    </span>
                    <span class="admin-badge" style="background: rgba(139, 92, 246, 0.12); color: #7c3aed; font-weight: 700;">
                        <i class="fa-solid fa-layer-group"></i> Sem ${escapeHTML(student.semester || "-")}
                    </span>
                </div>

                <div class="pending-student-actions" style="margin-top: 14px; display: flex; gap: 10px;">
                    <form action="/admin/students/approve/${studentId}" method="POST" class="pending-student-action-form" style="flex: 1;">
                        <button type="submit" class="admin-primary-btn pending-student-action-btn" style="width: 100%; justify-content: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                            <i class="fa-solid fa-check"></i> Approve
                        </button>
                    </form>

                    <form action="/admin/students/${studentId}/delete" method="POST" class="pending-student-action-form reject-form" style="flex: 1;">
                        <input type="hidden" name="returnTo" value="/admin/students/pending">
                        <button type="button" class="admin-secondary-btn danger pending-student-action-btn js-reject-btn" style="width: 100%; justify-content: center;">
                            <i class="fa-solid fa-xmark"></i> Reject
                        </button>
                    </form>
                </div>
            </div>
        `;

        return card;
    }

    let currentCount = document.querySelectorAll("#pending-grid .admin-student-card").length;
    updateCounts(currentCount);

    function addNewStudent(student) {
        if (!student || (!student._id && !student.id)) return;
        const studentId = student._id || student.id;

        if (document.getElementById("student-card-" + studentId)) {
            return;
        }

        const card = buildPendingStudentCard(student);
        grid.insertBefore(card, grid.firstChild);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                card.classList.add("pending-card-enter-active");
                setTimeout(function () {
                    card.classList.remove("pending-card-enter", "pending-card-enter-active");
                }, 1300);
            });
        });

        const newCount = document.querySelectorAll("#pending-grid .admin-student-card").length;
        updateCounts(newCount);

        if (typeof Swal !== "undefined") {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'info',
                title: 'New Student Registration: ' + (student.fullName || 'Student')
            });
        }
    }

    if (socket) {
        socket.on("admin:newRegistration", function (student) {
            addNewStudent(student);
        });

        socket.on("admin:studentApproved", function (payload) {
            if (payload && payload.studentId) {
                removeStudentCard(payload.studentId);
            }
        });

        socket.on("admin:studentRejected", function (payload) {
            if (payload && payload.studentId) {
                removeStudentCard(payload.studentId);
            }
        });
    }

    // Active real-time sync via JSON endpoint
    function syncPendingStudents() {
        fetch("/admin/students/pending/json", {
            headers: { "Accept": "application/json" }
        })
        .then(function (res) {
            return res.json();
        })
        .then(function (data) {
            if (data && data.success && Array.isArray(data.pendingStudents)) {
                const pending = data.pendingStudents;
                const serverIds = new Set(pending.map(s => String(s._id || s.id)));

                // Add any missing
                pending.forEach(function (student) {
                    const sId = String(student._id || student.id);
                    if (!document.getElementById("student-card-" + sId)) {
                        addNewStudent(student);
                    }
                });

                // Remove any no longer pending
                document.querySelectorAll("#pending-grid .admin-student-card").forEach(function (card) {
                    const cardId = card.id.replace("student-card-", "");
                    if (!serverIds.has(cardId)) {
                        card.remove();
                    }
                });

                updateCounts(pending.length);
            }
        })
        .catch(function () {});
    }

    function removeStudentCard(studentId) {
        const card = document.getElementById("student-card-" + studentId);
        if (card) {
            card.style.transition = "all 0.3s ease";
            card.style.opacity = "0";
            card.style.transform = "scale(0.95)";
            setTimeout(function () {
                card.remove();
                const count = document.querySelectorAll("#pending-grid .admin-student-card").length;
                updateCounts(count);
            }, 300);
        }
    }

    // Form submission handling for instant feedback
    document.addEventListener("submit", function (event) {
        if (event.target && event.target.matches(".pending-student-action-form")) {
            event.preventDefault();

            const form = event.target;
            const card = form.closest(".admin-item-card");
            let submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('.js-reject-btn');
            const formData = new FormData(form);

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.dataset.origHtml = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }

            fetch(form.action, {
                method: "POST",
                body: formData,
                headers: {
                    "Accept": "application/json",
                    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || ""
                }
            })
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data.success) {
                    if (card && card.id) {
                        const sId = card.id.replace("student-card-", "");
                        removeStudentCard(sId);
                    }
                } else {
                    alert(data.error || "An error occurred.");
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = submitBtn.dataset.origHtml;
                    }
                }
            })
            .catch(function (err) {
                console.error("Action error:", err);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.origHtml;
                }
            });
        }
    });

    document.addEventListener("click", function (event) {
        const rejectBtn = event.target.closest(".js-reject-btn");
        if (rejectBtn) {
            const form = rejectBtn.closest("form");
            if (typeof Swal !== "undefined") {
                Swal.fire({
                    title: 'Reject Registration?',
                    text: 'Are you sure you want to reject and delete this student registration?',
                    icon: "warning",
                    iconColor: "#ef4444",
                    showCancelButton: true,
                    confirmButtonColor: "#ef4444",
                    confirmButtonText: "Yes, reject",
                    cancelButtonText: "Cancel"
                }).then(function (result) {
                    if (result.isConfirmed) {
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                });
            } else {
                if (confirm("Are you sure you want to reject and delete this student registration?")) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            }
        }
    });

    // Run active background sync every 4 seconds
    setInterval(syncPendingStudents, 4000);
});
