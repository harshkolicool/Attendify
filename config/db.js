const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect("mongodb://127.0.0.1:27017/attendance-app");
        console.log("MongoDB Connected");
    } catch (err) {
        console.log("MongoDB Error:", err.message);
        console.log(err.stack);
    }
};

module.exports = connectDB;