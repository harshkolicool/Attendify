/**
 * Attendify Auth Pages Helper
 * Handles interactive password toggle and form enhancements.
 */

document.addEventListener("DOMContentLoaded", function () {
    // 1. Password Visibility Toggle
    const toggleButtons = document.querySelectorAll(".password-toggle-btn");

    toggleButtons.forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            const input = this.parentElement.querySelector("input");
            const icon = this.querySelector("i");

            if (input) {
                if (input.type === "password") {
                    input.type = "text";
                    if (icon) {
                        icon.classList.remove("fa-eye");
                        icon.classList.add("fa-eye-slash");
                    }
                } else {
                    input.type = "password";
                    if (icon) {
                        icon.classList.remove("fa-eye-slash");
                        icon.classList.add("fa-eye");
                    }
                }
            }
        });
    });
});
