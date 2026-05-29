const { io } = require("socket.io-client");

async function run() {
    console.log("Starting geo location stress test...");
    
    // Create 500 sockets
    const sockets = [];
    for (let i = 0; i < 500; i++) {
        const socket = io("http://localhost:3000", {
            transports: ["websocket"],
            reconnection: false
        });
        
        socket.on("connect", () => {
            // Fake student data
            socket.emit("student:join", { studentId: "test" + i });
            
            // Start spamming location
            setInterval(() => {
                socket.emit("student:location:update", {
                    sessionId: "test-session-id",
                    deviceId: "device-" + i,
                    latitude: 40.0 + (Math.random() * 0.01),
                    longitude: -74.0 + (Math.random() * 0.01),
                    accuracy: 10
                });
            }, 2000); // Every 2 seconds
        });
        
        sockets.push(socket);
    }
    
    console.log("500 sockets created and emitting location.");
}

run();
