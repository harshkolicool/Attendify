module.exports = {
  apps: [
    {
      name: "Attendify",
      script: "./cluster.js",
      instances: 1, // cluster.js already forks workers based on CPU cores
      exec_mode: "fork", // Use fork mode since our cluster.js handles the native Node.js clustering
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
        TRUST_PROXY: "1"
      }
    }
  ]
};
