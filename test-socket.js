const { io } = require("socket.io-client");
const socket = io("http://localhost:3000", {
    transports: ["websocket"]
});
socket.on("connect", () => {
    console.log("Connected with id:", socket.id);
    socket.emit("student:join");
});
socket.on("connect_error", (err) => {
    console.log("Connect Error:", err.message);
});
socket.on("socket:error", (err) => {
    console.log("Socket Error:", err);
});
socket.on("disconnect", (reason) => {
    console.log("Disconnected:", reason);
});
setTimeout(() => {
    socket.disconnect();
    process.exit(0);
}, 3000);
