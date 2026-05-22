function getTeacherLocationAndSubmit(event, form) {
    event.preventDefault();

    const latitudeInput = form.querySelector("input[name='teacherLatitude']");
    const longitudeInput = form.querySelector("input[name='teacherLongitude']");

    if (!latitudeInput || !longitudeInput) {
        alert("Location inputs are missing in the form");
        return false;
    }

    if (!navigator.geolocation) {
        alert("Your browser does not support location access");
        return false;
    }

    const button = form.querySelector("button[type='submit']");
    const oldText = button ? button.innerText : "Start";

    if (button) {
        button.innerText = "Getting Location...";
        button.disabled = true;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            latitudeInput.value = position.coords.latitude;
            longitudeInput.value = position.coords.longitude;

            console.log("Teacher Latitude:", latitudeInput.value);
            console.log("Teacher Longitude:", longitudeInput.value);

            form.submit();
        },

        function (error) {
            console.log("Teacher location error:", error);
            alert("Please allow location access to start attendance");

            if (button) {
                button.innerText = oldText;
                button.disabled = false;
            }
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );

    return false;
}