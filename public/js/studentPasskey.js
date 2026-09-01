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

function getPasskeyCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
}

async function parseJsonResponse(response) {
    const text = await response.text();
    let data = null;

    if (text && text.trim()) {
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Not valid JSON (e.g. HTML error page or plain text)
        }
    }

    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: data,
        rawText: text
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

        const csrfToken = getPasskeyCsrfToken();
        const getHeaders = {
            "Accept": "application/json"
        };
        if (csrfToken) {
            getHeaders["X-CSRF-Token"] = csrfToken;
        }

        const optionsResponse = await fetch("/student/passkey/register/options", {
            method: "GET",
            headers: getHeaders,
            credentials: "same-origin"
        });

        const optionsResult = await parseJsonResponse(optionsResponse);

        if (optionsResult.status === 401) {
            showPasskeyMessage("Session expired. Redirecting to login...", "error");
            setTimeout(function () {
                window.location.href = "/student/login";
            }, 1200);
            return;
        }

        if (!optionsResult.ok || !optionsResult.data || optionsResult.data.success === false) {
            const errorMsg = (optionsResult.data && optionsResult.data.message) ||
                (optionsResult.status === 403
                    ? (optionsResult.data && optionsResult.data.message) || "Passkey setup is not open. Please request a setup window."
                    : "Could not start passkey setup (HTTP " + optionsResult.status + "). Please try again.");
            throw new Error(errorMsg);
        }

        const optionsJSON = optionsResult.data;

        button.innerText = "Verify on device...";

        let registrationResponse;
        try {
            registrationResponse = await SimpleWebAuthnBrowser.startRegistration({
                optionsJSON: optionsJSON
            });
        } catch (webauthnErr) {
            let userMsg = webauthnErr.message || "Passkey setup cancelled or unsupported.";
            const name = webauthnErr.name || "";

            if (name === "NotAllowedError" || userMsg.toLowerCase().includes("not allowed")) {
                userMsg = "Biometric prompt was cancelled or timed out. Please unlock your device and try again.";
            } else if (name === "InvalidStateError" || userMsg.toLowerCase().includes("already registered")) {
                userMsg = "This passkey or biometric authenticator is already registered on your account.";
            } else if (name === "NotSupportedError") {
                userMsg = "Biometrics are not supported or device lock is not set up on this device.";
            }
            throw new Error(userMsg);
        }

        const postHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
        if (csrfToken) {
            postHeaders["X-CSRF-Token"] = csrfToken;
        }

        const verifyResponse = await fetch("/student/passkey/register/verify", {
            method: "POST",
            headers: postHeaders,
            credentials: "same-origin",
            body: JSON.stringify(registrationResponse)
        });

        const verifyResult = await parseJsonResponse(verifyResponse);

        if (verifyResult.status === 401) {
            showPasskeyMessage("Session expired. Redirecting to login...", "error");
            setTimeout(function () {
                window.location.href = "/student/login";
            }, 1200);
            return;
        }

        if (!verifyResult.ok || !verifyResult.data || !verifyResult.data.success) {
            const errorMsg = (verifyResult.data && verifyResult.data.message) ||
                "Passkey verification failed (HTTP " + verifyResult.status + "). Please try again.";
            throw new Error(errorMsg);
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
        console.error("Passkey Registration Error:", err);

        let message = err.message || "Passkey setup cancelled or failed.";

        if (message.indexOf("security token") !== -1) {
            showPasskeyMessage("Session refreshing. Please wait a moment...", "error");
            setTimeout(function() {
                window.location.reload();
            }, 1500);
            return;
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

        const csrfToken = getPasskeyCsrfToken();
        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
        if (csrfToken) {
            headers["X-CSRF-Token"] = csrfToken;
        }

        const response = await fetch("/student/device/register", {
            method: "POST",
            headers: headers,
            credentials: "same-origin",
            body: JSON.stringify({
                password: password,
                browserFingerprint: getBrowserFingerprintForSecurityPage()
            })
        });

        const result = await parseJsonResponse(response);

        if (result.status === 401) {
            showPasskeyMessage("Session expired. Redirecting to login...", "error");
            setTimeout(function () {
                window.location.href = "/student/login";
            }, 1200);
            return;
        }

        if (!result.ok || !result.data || !result.data.success) {
            throw new Error((result.data && result.data.message) || "Could not trust this browser (HTTP " + result.status + ").");
        }

        passwordInput.value = "";

        showPasskeyMessage(result.data.message || "Browser trusted successfully.", "success");

        setTimeout(function () {
            window.location.reload();
        }, 1000);

    } catch (err) {
        console.error("Trusted Browser Error:", err);
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

    const csrfToken = getPasskeyCsrfToken();
    const getHeaders = {
        "Accept": "application/json"
    };
    if (csrfToken) {
        getHeaders["X-CSRF-Token"] = csrfToken;
    }

    const optionsResponse = await fetch("/student/attendance/passkey/options/" + sessionId, {
        method: "GET",
        headers: getHeaders,
        credentials: "same-origin"
    });

    const optionsResult = await parseJsonResponse(optionsResponse);

    if (!optionsResult.ok || !optionsResult.data || optionsResult.data.success === false) {
        throw new Error((optionsResult.data && optionsResult.data.message) || "Passkey verification could not start.");
    }

    const optionsJSON = optionsResult.data;

    const authenticationResponse = await SimpleWebAuthnBrowser.startAuthentication({
        optionsJSON: optionsJSON
    });

    const postHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };
    if (csrfToken) {
        postHeaders["X-CSRF-Token"] = csrfToken;
    }

    const verifyResponse = await fetch("/student/attendance/passkey/verify/" + sessionId, {
        method: "POST",
        headers: postHeaders,
        credentials: "same-origin",
        body: JSON.stringify(authenticationResponse)
    });

    const verifyResult = await parseJsonResponse(verifyResponse);

    if (!verifyResult.ok || !verifyResult.data || !verifyResult.data.success) {
        throw new Error((verifyResult.data && verifyResult.data.message) || "Passkey verification failed.");
    }

    return verifyResult.data.attendanceToken;
}
