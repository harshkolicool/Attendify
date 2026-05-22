function showMessage(message, type) {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) {
        alert(message);
        return;
    }

    messageBox.innerHTML = "";

    const div = document.createElement("div");
    div.className = type === "success" ? "success-box" : "error-box";
    div.innerText = message;

    messageBox.appendChild(div);

    setTimeout(function () {
        div.remove();
    }, 5000);
}

function markAttendance(sessionId, button) {
    if (!navigator.geolocation) {
        showMessage("Your browser does not support location access", "error");
        return;
    }

    const oldText = button.innerText;

    button.innerText = "Getting Location...";
    button.disabled = true;

    navigator.geolocation.getCurrentPosition(
        function (position) {
            fetch("/student/attendance/mark", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    sessionId: sessionId,
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                })
            })
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (data.success) {
                    showMessage(data.message, "success");

                    button.innerText = "Marked";
                    button.classList.add("marked");
                    button.disabled = true;
                } else {
                    showMessage(data.message, "error");

                    button.innerText = oldText;
                    button.disabled = false;
                }
            })
            .catch(function (err) {
                console.log(err);
                showMessage("Something went wrong while marking attendance", "error");

                button.innerText = oldText;
                button.disabled = false;
            });
        },

        function (error) {
            console.log(error);
            showMessage("Please allow location access to mark attendance", "error");

            button.innerText = oldText;
            button.disabled = false;
        },

        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}