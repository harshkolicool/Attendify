document.addEventListener("DOMContentLoaded", function () {
  const path = window.location.pathname || "";

  if (path.indexOf("/admin/") !== 0) {
    return;
  }

  function dispatchRealtimeEvent(name, detail) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail: detail || {}
      })
    );
  }

  function attachSocketHandlers() {
    const socket = window.AttendifySharedSocket;

    if (!socket || socket.__adminRealtimeAttached === true) {
      return;
    }

    socket.__adminRealtimeAttached = true;
    window.__attendifyRoleSpecificRealtime = true;

    function joinAdminRealtime() {
      socket.emit("admin:join");
    }

    socket.on("connect", joinAdminRealtime);

    if (socket.connected) {
      joinAdminRealtime();
    }

    socket.on("attendance:started:admin", function (payload) {
      dispatchRealtimeEvent("attendify:attendance-started", payload);
    });

    socket.on("attendance:extended:admin", function (payload) {
      dispatchRealtimeEvent("attendify:attendance-extended", payload);
    });

    socket.on("attendance:ended:admin", function (payload) {
      dispatchRealtimeEvent("attendify:attendance-ended", payload);
    });

    socket.on("schedule:changed", function (payload) {
      dispatchRealtimeEvent("attendify:schedule-changed", payload);
    });

    socket.on("suspicious:attempt", function (payload) {
      dispatchRealtimeEvent("attendify:suspicious-attempt", payload);
    });
  }

  if (window.AttendifySharedSocket) {
    attachSocketHandlers();
    return;
  }

  window.addEventListener(
    "attendify:socket-ready",
    function () {
      attachSocketHandlers();
    },
    { once: true }
  );
});
