require("dotenv").config();

const mongoose = require("mongoose");

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
        };

        cached.promise = mongoose.connect(mongoUri, opts).then((mongoose) => {
            console.log("MongoDB Connected (Cached)");
            return mongoose;
        }).catch((err) => {
            console.error("MongoDB Error:", err.message);
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