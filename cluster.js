const cluster = require('cluster');
const os = require('os');
const { setupMaster } = require('@socket.io/sticky');
const { setupPrimary } = require('@socket.io/cluster-adapter');

if (cluster.isMaster || cluster.isPrimary) {
    const numCPUs = os.cpus().length;
    console.log(`[CLUSTER] Master process is running with PID ${process.pid}`);
    console.log(`[CLUSTER] Booting ${numCPUs} worker processes...`);

    // Create a dummy HTTP server for sticky sessions routing
    const http = require('http');
    const httpServer = http.createServer();

    // Setup @socket.io/sticky and @socket.io/cluster-adapter on master
    setupMaster(httpServer, {
        loadBalancingMethod: 'least-connection'
    });

    setupPrimary();

    cluster.setupPrimary({
        serialization: 'advanced'
    });

    const PORT = process.env.PORT || 8000;
    httpServer.listen(PORT, () => {
        console.log(`[CLUSTER] Load Balancer running on port ${PORT}`);
    });

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`[CLUSTER] Worker ${worker.process.pid} died (Code: ${code}). Restarting...`);
        cluster.fork();
    });
} else {
    // In worker process
    console.log(`[CLUSTER] Worker started with PID ${process.pid}`);
    
    // Set a flag so server.js knows it's running inside a cluster
    process.env.RUNNING_IN_CLUSTER = 'true';
    
    // Start the Express app but do NOT call server.listen() directly
    // The master process will handle routing HTTP traffic to this worker.
    require('./server.js');
}
