require("dotenv").config();

const mongoose = require("mongoose");
const logger = require("../utils/logger");

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
            throw new Error("MONGO_URI is missing in .env file");
        }

        const opts = {
            bufferCommands: false,
            // Connection pool: 10 connections per worker is a good balance.
            // For an 8-core cluster: 8 workers × 10 = 80 connections to Atlas.
            // Atlas M0 (free): 500 limit; M2: 5,000 limit.
            maxPoolSize: 10,
            minPoolSize: 2,
            // Fail fast if MongoDB is unreachable rather than hanging indefinitely
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // Heartbeat keeps idle connections alive through proxies / firewalls
            heartbeatFrequencyMS: 10000,
        };

        cached.promise = mongoose.connect(mongoUri, opts).then((mongoose) => {
            logger.info("MongoDB Connected (Cached)");
            return mongoose;
        }).catch((err) => {
            logger.error("MongoDB connection error", { msg: err.message });
            throw err;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
};

module.exports = connectDB;