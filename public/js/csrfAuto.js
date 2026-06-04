(function () {
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');

        if (!meta) {
            return "";
        }

        return meta.getAttribute("content") || "";
    }

    function isUnsafeMethod(method) {
        const upperMethod = String(method || "GET").toUpperCase();

        return (
            upperMethod === "POST" ||
            upperMethod === "PUT" ||
            upperMethod === "PATCH" ||
            upperMethod === "DELETE"
        );
    }

    function isMultipartForm(form) {
        const enctype = String(
            form.getAttribute("enctype") ||
            form.enctype ||
            ""
        ).toLowerCase();

        return enctype.includes("multipart/form-data");
    }

    function ensureFormToken(form) {
        if (!form) {
            return;
        }

        const method = String(form.getAttribute("method") || "GET").toUpperCase();

        if (!isUnsafeMethod(method)) {
            return;
        }

        const token = getCsrfToken();

        if (!token) {
            return;
        }

        let input = form.querySelector("input[name='_csrf']");

        if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = "_csrf";
            form.appendChild(input);
        }

        input.value = token;
    }

    function prepareAllForms() {
        const forms = document.querySelectorAll("form");

        forms.forEach(function (form) {
            ensureFormToken(form);
        });
    }

    document.addEventListener("DOMContentLoaded", function () {
        prepareAllForms();
    });

    document.addEventListener(
        "submit",
        function (event) {
            const form = event.target;
            ensureFormToken(form);

            // If it's a multipart form, submit via fetch to send CSRF token securely in headers
            if (isMultipartForm(form)) {
                event.preventDefault();
                
                const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
                if (submitButton) {
                    submitButton.disabled = true;
                    if (submitButton.innerHTML) {
                        submitButton.dataset.originalText = submitButton.innerHTML;
                        submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
                    }
                }

                const token = getCsrfToken();
                const formData = new FormData(form);
                
                fetch(form.action || window.location.href, {
                    method: form.method || "POST",
                    body: formData,
                    headers: {
                        "X-CSRF-Token": token
                    }
                }).then(function(res) {
                    if (res.redirected) {
                        window.location.href = res.url;
                    } else if (res.ok) {
                        return res.text().then(function(html) {
                            document.open();
                            document.write(html);
                            document.close();
                        });
                    } else {
                        window.location.reload();
                    }
                }).catch(function(err) {
                    console.error("Form submit error:", err);
                    if (submitButton) {
                        submitButton.disabled = false;
                        if (submitButton.dataset.originalText) {
                            submitButton.innerHTML = submitButton.dataset.originalText;
                        }
                    }
                    alert("An error occurred during upload. Please check console.");
                });
            }
        },
        true
    );

    const originalFetch = window.fetch;

    window.fetch = function (input, init) {
        init = init || {};

        let method = init.method;

        if (!method && input && typeof input === "object" && input.method) {
            method = input.method;
        }

        method = method || "GET";

        if (isUnsafeMethod(method)) {
            const token = getCsrfToken();

            if (token) {
                if (!init.headers) {
                    init.headers = {};
                }

                if (init.headers instanceof Headers) {
                    init.headers.set("X-CSRF-Token", token);
                } else if (Array.isArray(init.headers)) {
                    init.headers.push(["X-CSRF-Token", token]);
                } else {
                    init.headers["X-CSRF-Token"] = token;
                }
            }
        }

        return originalFetch(input, init);
    };
})();