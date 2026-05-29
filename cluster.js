const cluster = require("cluster");
const http = require("http");
const { setupMaster } = require("@socket.io/sticky");
const { setupPrimary } = require("@socket.io/cluster-adapter");
const numCPUs = require("os").cpus().length;

if (cluster.isPrimary || cluster.isMaster) {
    console.log(`Primary ${process.pid} is running`);

    const httpServer = http.createServer();

    // Setup sticky sessions
    setupMaster(httpServer, {
        loadBalancingMethod: "least-connection"
    });

    // Setup connections between the workers
    setupPrimary();

    cluster.setupPrimary({
        serialization: "advanced"
    });

    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
        console.log(`Cluster Primary listening on port ${PORT}`);
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    console.log(`Worker ${process.pid} started`);
    require("./server.js").startServer();
}
