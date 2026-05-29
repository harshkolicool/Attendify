/**
 * Custom UI Alerts using SweetAlert2
 * Provides drop-in replacements for native alert() and confirm() dialogs.
 */

window.uiAlert = function (message, title = "Alert", icon = "info") {
    return Swal.fire({
        title: title,
        text: message,
        icon: icon,
        confirmButtonColor: "#2563eb", // Tailwind blue-600 to match admin-primary-btn
        confirmButtonText: "OK",
        customClass: {
            popup: 'admin-card',
            confirmButton: 'admin-primary-btn'
        }
    });
};

window.uiConfirm = function (event, message, title = "Are you sure?") {
    // Stop the form from submitting immediately
    event.preventDefault();
    
    // Find the closest form to submit if confirmed
    const form = event.target.closest("form") || event.target;
    
    // Some buttons use data-confirm for the message
    const customMessage = message || event.target.dataset.confirm || "Are you sure you want to proceed?";

    Swal.fire({
        title: title,
        text: customMessage,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#ef4444", // Tailwind red-500
        cancelButtonColor: "#64748b", // Tailwind slate-500
        confirmButtonText: "Yes, proceed",
        cancelButtonText: "Cancel",
        customClass: {
            popup: 'admin-card',
            confirmButton: 'admin-primary-btn danger',
            cancelButton: 'admin-secondary-btn'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // Programmatically submit the form
            // Bypasses the onsubmit handler to prevent infinite loops
            form.submit();
        }
    });
    
    // Return false to ensure the native onsubmit returns false
    return false;
};
