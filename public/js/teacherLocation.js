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
            return "Location request timed out. Please try again.";
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
        var radiusHint = 100;
        var radiusInput = formRef && formRef.querySelector("input[name='classroomRadius']");

        if (radiusInput && radiusInput.value) {
            radiusHint = Number(radiusInput.value);
        }

        var geoOptions =
            window.AttendifyGeo && typeof window.AttendifyGeo.getCollectionOptionsForRadius === "function"
                ? window.AttendifyGeo.getCollectionOptionsForRadius(radiusHint)
                : null;

        if (window.AttendifyGeo && typeof window.AttendifyGeo.getBestPosition === "function") {
            var finalOptions = Object.assign({}, geoOptions || {}, {
                radiusHintMeters: radiusHint
            });

            return window.AttendifyGeo.getBestPosition(onProgress, finalOptions);
        }

        // Fallback: original simple sampler
        return new Promise(function (resolve, reject) {
            var samples    = [];
            var lastError  = null;
            var finished   = false;
            var watchId    = null;
            var timeoutId  = null;

            var targetAccuracyMeters     = 10;
            var acceptableAccuracyMeters = 15;
            var minimumSamples           = 8;
            var minCollectionMs          = 15000;
            var maxWaitMs                = 25000;
            var startTime                = Date.now();

            function cleanup() {
                if (timeoutId) clearTimeout(timeoutId);
                if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            }

            function getAccuracy(position) {
                return Number(
                    position && position.coords &&
                    Number.isFinite(Number(position.coords.accuracy))
                        ? position.coords.accuracy : 999999
                );
            }

            function getBestSample() {
                samples.sort(function (a, b) { return getAccuracy(a) - getAccuracy(b); });
                return samples[0];
            }

            function finish(error) {
                if (finished) return;
                finished = true;
                cleanup();
                if (samples.length === 0) {
                    reject(error || lastError || new Error("Could not get location."));
                    return;
                }
                resolve(getBestSample());
            }

            function minCollectionReached() {
                return Date.now() - startTime >= minCollectionMs;
            }

            function addSample(position) {
                if (finished || !position || !position.coords) return;

                var lat = Number(position.coords.latitude);
                var lon = Number(position.coords.longitude);
                var accuracy = getAccuracy(position);

                if (!Number.isFinite(lat) || !Number.isFinite(lon) || accuracy <= 0 || accuracy > 150) {
                    return;
                }

                samples.push(position);
                if (onProgress && typeof onProgress === "function") onProgress(accuracy, getBestSample());

                if (!minCollectionReached()) {
                    return;
                }

                if (samples.length >= minimumSamples && accuracy <= targetAccuracyMeters) {
                    finish();
                    return;
                }

                if (samples.length >= minimumSamples && accuracy <= acceptableAccuracyMeters) {
                    setTimeout(function () { if (!finished) finish(); }, 1200);
                }
            }

            function handleError(error) {
                lastError = error;
                if (error && Number(error.code) === 1) finish(error);
            }

            var options = { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 };
            navigator.geolocation.getCurrentPosition(addSample, handleError, options);
            try { watchId = navigator.geolocation.watchPosition(addSample, handleError, options); } catch (e) { lastError = e; }
            timeoutId = setTimeout(function () { finish(); }, maxWaitMs);
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
