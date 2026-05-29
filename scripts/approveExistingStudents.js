const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const Student = require("../models/studentSchema");
const connectDB = require("../config/db");

async function run() {
    await connectDB();
    console.log("Approving existing students...");
    const result = await Student.updateMany(
        { isApproved: { $ne: true } },
        { $set: { isApproved: true } }
    );
    console.log(`Approved ${result.modifiedCount} students.`);
    process.exit(0);
}

run();
