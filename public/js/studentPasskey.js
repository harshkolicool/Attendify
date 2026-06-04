document.addEventListener("DOMContentLoaded", function () {
    const registerButton = document.getElementById("registerPasskeyBtn");
    const passkeyStatusText = document.getElementById("passkeyStatusText");
    const trustedDeviceForm = document.getElementById("trustedDeviceForm");
    const passkeySupportHint = document.getElementById("passkeySupportHint");

    if (registerButton) {
        registerButton.addEventListener("click", function () {
            registerStudentPasskey(registerButton, passkeyStatusText);
        });
        
        // Handle expiration dynamically
        const allowedUntilStr = registerButton.getAttribute("data-allowed-until");
        if (allowedUntilStr && !registerButton.disabled) {
            const allowedUntil = parseInt(allowedUntilStr, 10);
            if (!isNaN(allowedUntil)) {
                const timeRemaining = allowedUntil - Date.now();
                if (timeRemaining > 0) {
                    setTimeout(function() {
                        if (!registerButton.disabled) {
                            registerButton.disabled = true;
                            registerButton.innerHTML = '<i class="fa-solid fa-clock"></i> Setup Window Expired';
                            showPasskeyMessage("Your 30-minute passkey setup window has expired. Please request a new passkey setup.", "error");
                        }
                    }, timeRemaining);
                } else {
                    registerButton.disabled = true;
                    registerButton.innerHTML = '<i class="fa-solid fa-clock"></i> Setup Window Expired';
                }
            }
        }
    }

    if (registerButton && passkeySupportHint) {
        checkLocalPasskeySupport().then(function (support) {
            if (support.supported) {
                passkeySupportHint.innerText = "Passkeys are available in this browser.";
                passkeySupportHint.classList.add("supported");
                return;
            }

            passkeySupportHint.innerText = !window.isSecureContext
                ? support.message + " Attendance location also needs HTTPS."
                : support.message + " Use trusted browser fallback below.";
            passkeySupportHint.classList.add("unsupported");

            if (!registerButton.disabled) {
                registerButton.disabled = true;
                registerButton.innerHTML = '<i class="fa-solid fa-ban"></i> Passkey Unavailable';
            }
        });
    }

    if (trustedDeviceForm) {
        trustedDeviceForm.addEventListener("submit", function (event) {
            event.preventDefault();
            registerTrustedBrowserFromSecurityPage(trustedDeviceForm);
        });
    }
});

function passkeyLibraryReady() {
    return typeof SimpleWebAuthnBrowser !== "undefined";
}

function webauthnAvailable() {
    return typeof PublicKeyCredential !== "undefined";
}

function showPasskeyMessage(message, type) {
    if (typeof showMessage === "function") {
        showMessage(message, type || "success");
        return;
    }

    const messageBox = document.getElementById("messageBox");

    if (messageBox) {
        messageBox.innerHTML = "";

        const div = document.createElement("div");
        div.className = type === "error" ? "error-box" : "success-box";
        div.innerText = message;

        messageBox.appendChild(div);

        setTimeout(function () {
            div.remove();
        }, 5000);

        return;
    }

    uiAlert(message);
}

function getBrowserFingerprintForSecurityPage() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    const languageToken = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages.slice(0, 4).join(",")
        : (navigator.language || "unknown");
    const width = Number(screen && screen.width) || 0;
    const height = Number(screen && screen.height) || 0;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    const stableScreen = shortEdge > 0 && longEdge > 0
        ? shortEdge + "x" + longEdge
        : "unknown";

    let webglVendor = "unknown";
    let webglRenderer = "unknown";
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
            const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
            if (debugInfo) {
                webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "unknown";
                webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "unknown";
            }
        }
    } catch (e) {
        webglVendor = "error";
    }

    const deviceMemory = navigator.deviceMemory || "unknown";

    return [
        navigator.userAgent || "unknown",
        languageToken,
        timezone,
        stableScreen,
        screen.colorDepth || "unknown",
        navigator.platform || "unknown",
        Number(navigator.hardwareConcurrency || 0) || "unknown",
        deviceMemory,
        Number(navigator.maxTouchPoints || 0) || 0,
        webglVendor,
        webglRenderer
    ].join("|");
}

function getPasskeyBrowserHelpMessage() {
    if (!window.isSecureContext) {
        return "Passkeys need HTTPS or localhost. Use localhost during development or HTTPS in production.";
    }

    if (!webauthnAvailable()) {
        return "This browser does not support passkeys. Use latest Chrome, Edge, Safari, or Firefox with passkey support.";
    }

    return "";
}

async function checkLocalPasskeySupport() {
    const browserMessage = getPasskeyBrowserHelpMessage();

    if (browserMessage) {
        return {
            supported: false,
            message: browserMessage
        };
    }

    return {
        supported: true
    };
}

async function registerStudentPasskey(button, statusText) {
    if (button.hasAttribute("data-registration-active")) {
        return;
    }

    try {
        button.setAttribute("data-registration-active", "true");
        if (!passkeyLibraryReady()) {
            showPasskeyMessage("Passkey library is not loaded. Check internet and refresh.", "error");
            return;
        }

        const support = await checkLocalPasskeySupport();

        if (!support.supported) {
            showPasskeyMessage(support.message, "error");
            return;
        }

        button.disabled = true;
        button.innerText = "Starting...";

        const optionsResponse = await fetch("/student/passkey/register/options", {
            method: "GET",
            credentials: "same-origin"
        });

        const optionsJSON = await optionsResponse.json();

        if (!optionsResponse.ok || optionsJSON.success === false) {
            throw new Error(optionsJSON.message || "Could not start passkey setup.");
        }

        button.innerText = "Verify on device...";

        const registrationResponse = await SimpleWebAuthnBrowser.startRegistration({
            optionsJSON: optionsJSON
        });

        const verifyResponse = await fetch("/student/passkey/register/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(registrationResponse)
        });

        const verifyJSON = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyJSON.success) {
            throw new Error(verifyJSON.message || "Passkey setup failed.");
        }

        if (statusText) {
            statusText.innerText = "Passkey active";
        }

        button.innerText = "Passkey Registered";
        button.classList.add("marked");
        button.disabled = true;

        showPasskeyMessage("Passkey registered successfully.", "success");

        if (window.location.pathname === "/student/passkeys") {
            setTimeout(function () {
                window.location.reload();
            }, 800);
        }

    } catch (err) {
        console.log(err);

        let message = err.message || "Passkey setup cancelled or failed.";

        if (message.indexOf("security token") !== -1) {
            showPasskeyMessage("Session refreshing. Please wait a moment...", "error");
            setTimeout(function() {
                window.location.reload();
            }, 1500);
            return;
        }

        if (
            message.toLowerCase().includes("notallowed") ||
            message.toLowerCase().includes("not allowed")
        ) {
            message = "Passkey setup was cancelled or blocked. Use normal browser profile, enable device lock/Touch ID/PIN, and avoid Guest/Incognito mode.";
        }

        showPasskeyMessage(message, "error");

        button.disabled = false;
        button.innerText = "Add New Passkey";
    } finally {
        button.removeAttribute("data-registration-active");
    }
}

async function registerTrustedBrowserFromSecurityPage(form) {
    const passwordInput = form.querySelector("input[name='password']");
    const button = form.querySelector("button[type='submit']");

    if (!passwordInput || !button) {
        showPasskeyMessage("Trusted browser form is incomplete.", "error");
        return;
    }

    const password = passwordInput.value;

    if (!password) {
        showPasskeyMessage("Enter your password to trust this browser.", "error");
        return;
    }

    const oldText = button.innerText;

    try {
        button.disabled = true;
        button.innerText = "Verifying...";

        const response = await fetch("/student/device/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                password: password,
                browserFingerprint: getBrowserFingerprintForSecurityPage()
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Could not trust this browser.");
        }

        passwordInput.value = "";

        showPasskeyMessage(data.message, "success");

        setTimeout(function () {
            window.location.reload();
        }, 1000);

    } catch (err) {
        console.log(err);
        let message = err.message || "Could not trust this browser. Please try again.";

        if (message.indexOf("security token") !== -1) {
            showPasskeyMessage("Session refreshing. Please wait a moment...", "error");
            setTimeout(function() {
                window.location.reload();
            }, 1500);
            return;
        }

        showPasskeyMessage(message, "error");
    } finally {
        button.disabled = false;
        button.innerText = oldText;
    }
}

async function getAttendanceTokenWithPasskey(sessionId) {
    if (!passkeyLibraryReady()) {
        throw new Error("Passkey library is not loaded. Refresh once.");
    }

    const browserMessage = getPasskeyBrowserHelpMessage();

    if (browserMessage) {
        throw new Error(browserMessage);
    }

    const optionsResponse = await fetch("/student/attendance/passkey/options/" + sessionId, {
        method: "GET",
        credentials: "same-origin"
    });

    const optionsJSON = await optionsResponse.json();

    if (!optionsResponse.ok || optionsJSON.success === false) {
        throw new Error(optionsJSON.message || "Passkey verification could not start.");
    }

    const authenticationResponse = await SimpleWebAuthnBrowser.startAuthentication({
        optionsJSON: optionsJSON
    });

    const verifyResponse = await fetch("/student/attendance/passkey/verify/" + sessionId, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(authenticationResponse)
    });

    const verifyJSON = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyJSON.success) {
        throw new Error(verifyJSON.message || "Passkey verification failed.");
    }

    return verifyJSON.attendanceToken;
}
