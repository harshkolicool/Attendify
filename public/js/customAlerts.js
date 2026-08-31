/**
 * Custom UI Alerts using SweetAlert2
 * Provides drop-in replacements for native alert() and confirm() dialogs.
 */

window.uiAlert = function (message, title = "Alert", icon = "info") {
    return Swal.fire({
        title: title,
        text: message,
        icon: icon,
        position: "center",
        confirmButtonColor: "#2563eb",
        confirmButtonText: "OK",
        customClass: {
            container: "shell-enhanced-container",
            popup: "shell-enhanced-alert",
            title: "shell-enhanced-title",
            htmlContainer: "shell-enhanced-text",
            actions: "shell-enhanced-actions",
            confirmButton: "shell-enhanced-confirm"
        }
    });
};

window.uiConfirm = function (event, message, title = "Are you sure?") {
    if (event) {
        event.preventDefault();
    }
    
    const form = event && event.target ? (event.target.closest("form") || event.target) : null;
    const customMessage = message || (event && event.target && event.target.dataset ? event.target.dataset.confirm : null) || "Are you sure you want to proceed?";

    Swal.fire({
        title: title,
        text: customMessage,
        icon: "warning",
        iconColor: "#fba341",
        position: "center",
        showCancelButton: true,
        confirmButtonColor: "#2563eb",
        confirmButtonText: "Yes, proceed",
        cancelButtonText: "Cancel",
        customClass: {
            container: "shell-enhanced-container",
            popup: "shell-enhanced-alert",
            title: "shell-enhanced-title",
            htmlContainer: "shell-enhanced-text",
            actions: "shell-enhanced-actions",
            confirmButton: "shell-enhanced-confirm",
            cancelButton: "shell-enhanced-cancel"
        }
    }).then((result) => {
        if (result.isConfirmed && form) {
            form.submit();
        }
    });
};

window.uiToast = window.showToast = function (message, icon = "success", title = "") {
    if (typeof Swal === "undefined") {
        console.log(message);
        return;
    }

    const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener("mouseenter", Swal.stopTimer);
            toast.addEventListener("mouseleave", Swal.resumeTimer);
        },
        customClass: {
            popup: "shell-enhanced-toast"
        }
    });

    return Toast.fire({
        icon: icon,
        title: title || message,
        text: title ? message : undefined
    });
};


