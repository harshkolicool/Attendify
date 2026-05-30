/**
 * Kalman Filter for GPS coordinates smoothing.
 * Filters out jitter and sudden spikes using velocity estimation.
 */
(function(root) {
    "use strict";

    class KalmanFilter {
        constructor() {
            this.state = null; // [lat, lon, vLat, vLon]
            this.covariance = [
                [1, 0, 0, 0],
                [0, 1, 0, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1]
            ];
            this.lastTimestamp = 0;
            this.minAccuracy = 1;
        }

        init(lat, lon, accuracy, timestamp) {
            this.state = [lat, lon, 0, 0];
            const acc = Math.max(accuracy, this.minAccuracy);
            // Rough conversion: 1 degree ~ 111,111 meters. Variance in degrees:
            const varPos = (acc * acc) / (111111 * 111111);
            this.covariance = [
                [varPos, 0, 0, 0],
                [0, varPos, 0, 0],
                [0, 0, 1, 0], // arbitrary large initial velocity variance
                [0, 0, 0, 1]
            ];
            this.lastTimestamp = timestamp;
        }

        filter(lat, lon, accuracy, timestamp) {
            if (!this.state) {
                this.init(lat, lon, accuracy, timestamp);
                return { lat: this.state[0], lon: this.state[1] };
            }

            const dt = Math.max((timestamp - this.lastTimestamp) / 1000.0, 0.1);
            this.lastTimestamp = timestamp;

            // Prediction Step
            const predictedLat = this.state[0] + this.state[2] * dt;
            const predictedLon = this.state[1] + this.state[3] * dt;
            const predictedVLat = this.state[2];
            const predictedVLon = this.state[3];

            // Process noise Q
            const q = 0.000000000001;
            const Q = [
                [q*dt*dt, 0, q*dt, 0],
                [0, q*dt*dt, 0, q*dt],
                [q*dt, 0, q, 0],
                [0, q*dt, 0, q]
            ];

            const P = this.covariance;
            let P_pred = [
                [P[0][0] + dt*(P[2][0] + P[0][2] + dt*P[2][2]) + Q[0][0], 0, P[0][2] + dt*P[2][2] + Q[0][2], 0],
                [0, P[1][1] + dt*(P[3][1] + P[1][3] + dt*P[3][3]) + Q[1][1], 0, P[1][3] + dt*P[3][3] + Q[1][3]],
                [P[2][0] + dt*P[2][2] + Q[2][0], 0, P[2][2] + Q[2][2], 0],
                [0, P[3][1] + dt*P[3][3] + Q[3][1], 0, P[3][3] + Q[3][3]]
            ];

            // Update Step
            const acc = Math.max(accuracy, this.minAccuracy);
            const r = (acc * acc) / (111111 * 111111); // Observation noise
            
            const S_lat = P_pred[0][0] + r;
            const S_lon = P_pred[1][1] + r;
            
            const K_lat_0 = P_pred[0][0] / S_lat;
            const K_lat_2 = P_pred[2][0] / S_lat;
            const K_lon_1 = P_pred[1][1] / S_lon;
            const K_lon_3 = P_pred[3][1] / S_lon;

            const y_lat = lat - predictedLat;
            const y_lon = lon - predictedLon;

            this.state[0] = predictedLat + K_lat_0 * y_lat;
            this.state[1] = predictedLon + K_lon_1 * y_lon;
            this.state[2] = predictedVLat + K_lat_2 * y_lat;
            this.state[3] = predictedVLon + K_lon_3 * y_lon;

            this.covariance[0][0] = (1 - K_lat_0) * P_pred[0][0];
            this.covariance[0][2] = (1 - K_lat_0) * P_pred[0][2];
            this.covariance[1][1] = (1 - K_lon_1) * P_pred[1][1];
            this.covariance[1][3] = (1 - K_lon_1) * P_pred[1][3];
            this.covariance[2][0] = -K_lat_2 * P_pred[0][0] + P_pred[2][0];
            this.covariance[2][2] = -K_lat_2 * P_pred[0][2] + P_pred[2][2];
            this.covariance[3][1] = -K_lon_3 * P_pred[1][1] + P_pred[3][1];
            this.covariance[3][3] = -K_lon_3 * P_pred[1][3] + P_pred[3][3];

            return { lat: this.state[0], lon: this.state[1] };
        }
    }

    root.KalmanFilter = KalmanFilter;
})(window);
