document.addEventListener("DOMContentLoaded", function () {
    const socket = io();
    const grid = document.getElementById("pending-grid");
    const emptyStateContainers = document.querySelectorAll(".js-empty-state-container");
    const countHeader = document.querySelector(".admin-card-header h2");

    if (!countHeader || !grid) {
        return;
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
        });
    }

    function showGrid() {
        grid.classList.remove("is-hidden");
    }

    function buildPendingStudentCard(student) {
        const studentId = escapeHTML(student._id);

        const card = document.createElement("article");
        card.className = "admin-item-card admin-student-card pending-card-enter";
        card.id = "student-card-" + studentId;

        card.innerHTML = `
            <div class="admin-item-top pending-student-top">
                <div class="pending-student-profile">
                    <img
                        src="https://ui-avatars.com/api/?name=${encodeURIComponent(student.fullName || "Student")}&background=random&color=fff&rounded=true&bold=true"
                        alt="${escapeHTML(student.fullName || "Student")}" 
                        class="pending-student-avatar"
                    >
                    <div>
                        <h4 class="pending-student-name">${escapeHTML(student.fullName || "Student")}</h4>
                        <p class="pending-student-email">${escapeHTML(student.email || "")}</p>
                    </div>
                </div>
            </div>

            <div class="admin-student-body pending-student-body">
                <div class="admin-meta admin-student-meta pending-student-meta">
                    <span class="admin-badge pending-badge-muted">
                        <i class="fa-solid fa-hashtag" aria-hidden="true"></i>
                        ${escapeHTML(student.enrollmentNumber || "-")}
                    </span>
                    <span class="admin-badge">
                        <i class="fa-solid fa-building" aria-hidden="true"></i>
                        ${escapeHTML(student.department || "-")}
                    </span>
                    <span class="admin-badge pending-badge-semester">
                        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
                        Sem ${escapeHTML(student.semester || "-")}
                    </span>
                </div>

                <div class="pending-student-actions">
                    <form action="/admin/students/approve/${studentId}" method="POST" class="pending-student-action-form">
                        <button type="submit" class="admin-primary-btn pending-student-action-btn">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                            Approve
                        </button>
                    </form>

                    <form action="/admin/students/${studentId}/delete" method="POST" class="pending-student-action-form reject-form">
                        <input type="hidden" name="returnTo" value="/admin/students/pending">
                        <button type="button" class="admin-secondary-btn danger pending-student-action-btn js-reject-btn">
                            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                            Reject
                        </button>
                    </form>
                </div>
            </div>
        `;

        return card;
    }

    let currentCount = parseInt((countHeader.textContent.match(/\d+/) || ["0"])[0], 10) || 0;

    socket.on("admin:newRegistration", function (student) {
        hideEmptyStates();
        showGrid();

        const card = buildPendingStudentCard(student || {});

        grid.insertBefore(card, grid.firstChild);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                card.classList.add("pending-card-enter-active");

                setTimeout(function () {
                    card.classList.remove("pending-card-enter", "pending-card-enter-active");
                }, 1300);
            });
        });

        currentCount += 1;
        countHeader.textContent = "Students Awaiting Approval (" + currentCount + ")";
    });

    // HTTP polling fallback
    function pollPendingStudents() {
        if (socket && socket.connected) {
            return;
        }

        fetch("/admin/students/pending/json")
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (data && data.success && data.pendingStudents) {
                    const newCount = data.pendingStudents.length;

                    if (newCount > currentCount) {
                        window.location.reload();
                    }
                }
            })
            .catch(function () {
                // Ignore; next poll will retry.
            });
    }

    function removeStudentCard(studentId) {
        const card = document.getElementById("student-card-" + studentId);
        if (card) {
            card.classList.add("pending-card-enter-active");
            setTimeout(() => card.remove(), 300);
            currentCount = Math.max(0, currentCount - 1);
            countHeader.textContent = "Students Awaiting Approval (" + currentCount + ")";
            if (currentCount === 0 && emptyStateContainers) {
                emptyStateContainers.forEach(c => c.classList.remove("is-hidden"));
            }
        }
    }

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

    // Intercept form submissions for Approve/Reject so we don't reload the page
    document.addEventListener("submit", function(event) {
        if (event.target && event.target.matches(".pending-student-action-form")) {
            event.preventDefault();

            const form = event.target;
            const card = form.closest(".admin-item-card");
            
            // Re-fetch the submit btn that might have been clicked (for approve)
            let submitBtn = form.querySelector('button[type="submit"]');
            
            // If it's the reject form, it might not have a submit button but a js-reject-btn
            if (!submitBtn) {
                submitBtn = form.querySelector('.js-reject-btn');
            }

            const formData = new FormData(form);
            
            if (submitBtn) {
                submitBtn.disabled = true;
                const origHtml = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                submitBtn.dataset.origHtml = origHtml;
            }

            fetch(form.action, {
                method: "POST",
                body: formData,
                headers: {
                    "Accept": "application/json",
                    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")
                }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const studentId = form.action.split("/").slice(-2, -1)[0]; // works for /approve/:id but not /:id/delete
                    // Let's just rely on the DOM card ID
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
            .catch(err => {
                console.error("Action error:", err);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.origHtml;
                }
            });
        }
    });

    document.addEventListener("click", function(event) {
        const rejectBtn = event.target.closest(".js-reject-btn");
        if (rejectBtn) {
            const form = rejectBtn.closest("form");
            Swal.fire({
                title: 'Are you sure?',
                text: 'Are you sure you want to reject and delete this registration?',
                icon: "warning",
                showCancelButton: true,
                confirmButtonColor: "#ef4444",
                cancelButtonColor: "#64748b",
                confirmButtonText: "Yes, reject",
                cancelButtonText: "Cancel",
                customClass: {
                    popup: 'admin-card',
                    confirmButton: 'admin-primary-btn danger',
                    cancelButton: 'admin-secondary-btn'
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
            });
        }
    });

    setInterval(pollPendingStudents, 10000);
});
