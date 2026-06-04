/**
 * Custom UI Alerts using SweetAlert2
 * Provides drop-in replacements for native alert() and confirm() dialogs.
 */

window.uiAlert = function (message, title = "Alert", icon = "info") {
    return Swal.fire({
        title: title,
        text: message,
        icon: icon,
        confirmButtonColor: "#0b63f6",
        confirmButtonText: "OK",
        customClass: {
            popup: 'shell-enhanced-alert',
            title: 'shell-enhanced-title',
            htmlContainer: 'shell-enhanced-text',
            actions: 'shell-enhanced-actions',
            confirmButton: 'shell-enhanced-confirm'
        }
    });
};

window.uiConfirm = function (event, message, title = "Are you sure?") {
    event.preventDefault();
    
    const form = event.target.closest("form") || event.target;
    const customMessage = message || event.target.dataset.confirm || "Are you sure you want to proceed?";

    Swal.fire({
        title: title,
        text: customMessage,
        icon: "warning",
        iconColor: "#fba341", // Custom orange color for icon
        showCancelButton: true,
        confirmButtonColor: "#0b63f6", // var(--shell-primary)
        cancelButtonColor: "#ffffff",
        confirmButtonText: "Yes, proceed",
        cancelButtonText: "Cancel",
        customClass: {
            popup: 'shell-enhanced-alert',
            title: 'shell-enhanced-title',
            htmlContainer: 'shell-enhanced-text',
            actions: 'shell-enhanced-actions',
            confirmButton: 'shell-enhanced-confirm',
            cancelButton: 'shell-enhanced-cancel'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            form.submit();
        }
    });
    
    // Return false to ensure the native onsubmit returns false
    return false;
};
