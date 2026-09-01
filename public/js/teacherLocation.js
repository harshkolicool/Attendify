(function () {
    const START_ATTENDANCE_PATH = "/teacher/attendance/start";

    function showLocationError(message) {
        const text = message || "Please allow location access to start attendance.";
        const box = document.createElement("div");
        box.className = "alert-box error";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-circle-exclamation";

        box.appendChild(icon);
        box.appendChild(document.createTextNode(" " + text));

        const main = document.querySelector(".teacher-main");
        const header = main ? main.querySelector(".teacher-header") : null;

        if (main && header) {
            const oldBox = main.querySelector("#teacherLocationClientError");

            if (oldBox) {
                oldBox.remove();
            }

            box.id = "teacherLocationClientError";
            header.insertAdjacentElement("afterend", box);

            box.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            return;
        }

        uiAlert(text);
    }

    function getStartButton(form) {
        if (!form) {
            return null;
        }

        return form.querySelector("button[type='submit']");
    }

    function setButtonLoading(form, loadingText) {
        const button = getStartButton(form);

        if (!button) {
            return "";
        }

        const oldText = button.textContent;
        button.textContent = loadingText || "Getting Location...";
        button.disabled = true;

        return oldText;
    }

    function resetButton(form, oldText) {
        const button = getStartButton(form);

        if (!button) {
            return;
        }

        if (oldText) {
            button.textContent = oldText;
        }

        button.disabled = false;
    }

    function getLocationInputs(form) {
        return {
            latitudeInput: form.querySelector("input[name='teacherLatitude']"),
            longitudeInput: form.querySelector("input[name='teacherLongitude']"),
            accuracyInput: form.querySelector("input[name='teacherAccuracy']")
        };
    }

    function isStartAttendanceForm(form) {
        if (!form) {
            return false;
        }

        const action = form.getAttribute("action") || "";

        if (!action) {
            return false;
        }

        try {
            const url = new URL(action, window.location.origin);
            return url.pathname === START_ATTENDANCE_PATH;
        } catch (err) {
            return action.indexOf(START_ATTENDANCE_PATH) !== -1;
        }
    }

    function getGeoErrorMessage(error) {
        if (!error || typeof error.code === "undefined") {
            return "Please allow location access to start attendance.";
        }

        if (error.code === 1) {
            return "Location access is blocked. Please allow location permission in browser/site settings and try again.";
        }

        if (error.code === 2) {
            return "Unable to detect your location. Check GPS/network and try again.";
        }

        if (error.code === 3) {
            return "Location signal took too long. Please ensure GPS/Location Services is enabled on your device and try again.";
        }

        return "Please allow location access to start attendance.";
    }

    function getAdaptiveConfidenceThresholdFromPosition(position, radiusHint) {
        var meta = position && position.meta ? position.meta : null;
        var target = Number(meta && meta.targetConfidenceScore);

        if (!Number.isFinite(target) || target <= 0) {
            target = 50;
        }

        var radius = Math.max(1, Number(radiusHint) || 100);
        if (radius <= 5) {
            target = Math.max(target, 63);
        } else if (radius < 25) {
            target = Math.max(target, 58);
        } else if (radius <= 50) {
            target = Math.max(target, 54);
        }

        return Math.max(45, Math.min(72, target));
    }

    function getBestTeacherLocationPosition(onProgress, formRef) {
        return new Promise(function (resolve, reject) {
            // 1. Check window.AttendifyLiveStream or cached location
            if (window.AttendifyLiveStream && typeof window.AttendifyLiveStream.getBestFreshPosition === "function") {
                var cached = window.AttendifyLiveStream.getBestFreshPosition(30000);
                if (cached && Number.isFinite(cached.latitude)) {
                    return resolve({
                        coords: {
                            latitude: cached.latitude,
                            longitude: cached.longitude,
                            accuracy: cached.accuracy || 20
                        }
                    });
                }
            }

            if (!navigator.geolocation) {
                return reject(new Error("Geolocation is not supported by your browser."));
            }

            var samples = [];
            var finished = false;
            var watchId = null;
            var timeoutId = null;

            function cleanup() {
                if (timeoutId) clearTimeout(timeoutId);
                if (watchId !== null) {
                    try { navigator.geolocation.clearWatch(watchId); } catch(e) {}
                    watchId = null;
                }
            }

            function getAccuracy(pos) {
                return Number(pos && pos.coords && Number.isFinite(Number(pos.coords.accuracy)) ? pos.coords.accuracy : 999999);
            }

            function getBestSample() {
                if (samples.length === 0) return null;
                samples.sort(function (a, b) { return getAccuracy(a) - getAccuracy(b); });
                return samples[0];
            }

            function finish(error) {
                if (finished) return;
                finished = true;
                cleanup();

                var best = getBestSample();
                if (best) {
                    return resolve(best);
                }

                // If high-accuracy timed out or returned no samples, fallback to single standard accuracy query
                navigator.geolocation.getCurrentPosition(
                    function (pos) { resolve(pos); },
                    function (fallbackErr) {
                        reject(fallbackErr || error || new Error("Could not detect location."));
                    },
                    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
                );
            }

            function addSample(position) {
                if (finished || !position || !position.coords) return;

                var lat = Number(position.coords.latitude);
                var lon = Number(position.coords.longitude);
                var accuracy = getAccuracy(position);

                if (!Number.isFinite(lat) || !Number.isFinite(lon) || accuracy <= 0) {
                    return;
                }

                samples.push(position);
                if (onProgress && typeof onProgress === "function") {
                    onProgress(accuracy, getBestSample(), samples.length);
                }

                // If we get an acceptable reading (or at least 2 samples), resolve quickly without hanging!
                if (accuracy <= 40 || samples.length >= 3) {
                    setTimeout(function () { finish(); }, 300);
                }
            }

            function handleError(error) {
                if (error && Number(error.code) === 1) {
                    return finish(error); // Permission denied
                }
                if (samples.length > 0) {
                    return finish();
                }
            }

            var options = { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 };
            navigator.geolocation.getCurrentPosition(addSample, handleError, options);
            try {
                watchId = navigator.geolocation.watchPosition(addSample, handleError, options);
            } catch (e) {}

            timeoutId = setTimeout(function () { finish(); }, 6000);
        });
    }

    function requestAndSubmitTeacherLocation(form) {
        const inputs = getLocationInputs(form);

        if (!inputs.latitudeInput || !inputs.longitudeInput || !inputs.accuracyInput) {
            showLocationError("Location inputs are missing in the form.");
            return false;
        }

        if (!navigator.geolocation) {
            showLocationError("Your browser does not support location access.");
            return false;
        }

        if (
            !window.isSecureContext &&
            window.location.hostname !== "localhost" &&
            window.location.hostname !== "127.0.0.1"
        ) {
            showLocationError("Location works only on HTTPS or localhost. Please open the secure URL and try again.");
            return false;
        }

        if (form.dataset.locationPending === "true") {
            return false;
        }

        form.dataset.locationPending = "true";

        const oldText = setButtonLoading(form, "Getting Location...");
        const button = getStartButton(form);
        let lastTipAt = 0;

        const radiusHint =
            form.querySelector("input[name='classroomRadius']") &&
            form.querySelector("input[name='classroomRadius']").value
                ? Number(form.querySelector("input[name='classroomRadius']").value)
                : 100;

        getBestTeacherLocationPosition(function(currentAccuracy, bestSample, sampleCountRaw) {
            if (button) {
                const bestAcc = bestSample && bestSample.coords ? Math.round(bestSample.coords.accuracy) : Math.round(currentAccuracy);
                const sampleCount = Number(sampleCountRaw) || (bestSample && bestSample.meta ? bestSample.meta.sampleCount : 0) || 0;
                
                let text = '<i class="fa-solid fa-spinner fa-spin"></i> GPS: ±' + bestAcc + 'm';
                if (sampleCount > 0) text += ' (' + sampleCount + ' samples)';
                
                button.innerHTML = text;
                
                // Show tip if accuracy is stuck high
                if (bestAcc > 100 && Date.now() - lastTipAt > 10000) {
                    lastTipAt = Date.now();
                    showLocationError(
                        "GPS accuracy is weak. Please turn on precise location, move near a window, wait a few seconds, and try again."
                    );
                }
            }
        }, form)
            .then(function (position) {
                // Only retry if accuracy is extremely poor (>200m)
                const accuracy = Number(position && position.coords && position.coords.accuracy);
                const isExtremelyPoor = Number.isFinite(accuracy) && accuracy > 200;

                if (isExtremelyPoor) {
                    if (button) {
                        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Improving GPS fix...';
                    }

                    return getBestTeacherLocationPosition(function (currentAccuracy, bestSample, sampleCountRaw) {
                        if (!button) return;
                        const bestAcc = bestSample && bestSample.coords
                            ? Math.round(bestSample.coords.accuracy)
                            : Math.round(currentAccuracy);
                        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GPS refine: ±' + bestAcc + 'm';
                    }, form).then(function (refinedPosition) {
                        const refinedAcc = Number(refinedPosition && refinedPosition.coords && refinedPosition.coords.accuracy);
                        if (Number.isFinite(refinedAcc) && refinedAcc < accuracy) {
                            return refinedPosition;
                        }
                        return position;
                    }).catch(function () {
                        return position;
                    });
                }

                return position;
            })
            .then(function (position) {
                inputs.latitudeInput.value = position.coords.latitude;
                inputs.longitudeInput.value = position.coords.longitude;
                inputs.accuracyInput.value = position.coords.accuracy;

                if (position.meta) {
                    let metaInput = form.querySelector("input[name='locationMeta']");
                    if (!metaInput) {
                        metaInput = document.createElement("input");
                        metaInput.type = "hidden";
                        metaInput.name = "locationMeta";
                        form.appendChild(metaInput);
                    }
                    metaInput.value = JSON.stringify(position.meta);
                }

                form.dataset.locationPending = "false";
                HTMLFormElement.prototype.submit.call(form);
            })
            .catch(function (error) {
                form.dataset.locationPending = "false";
                resetButton(form, oldText);
                showLocationError(getGeoErrorMessage(error));
            });

        return false;
    }

    function handleStartAttendanceSubmit(event) {
        const form = event.target;

        if (!isStartAttendanceForm(form)) {
            return;
        }

        event.preventDefault();
        requestAndSubmitTeacherLocation(form);
    }

    function registerStartAttendanceHandlers() {
        document.addEventListener("submit", handleStartAttendanceSubmit, true);
    }

    function getTeacherLocationAndSubmit(event, form) {
        if (event && typeof event.preventDefault === "function") {
            event.preventDefault();
        }

        if (!form || !isStartAttendanceForm(form)) {
            return true;
        }

        return requestAndSubmitTeacherLocation(form);
    }

    window.getTeacherLocationAndSubmit = getTeacherLocationAndSubmit;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", registerStartAttendanceHandlers);
    } else {
        registerStartAttendanceHandlers();
    }
})();
