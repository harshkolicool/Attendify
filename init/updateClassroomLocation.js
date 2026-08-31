require("dotenv").config();

const mongoose = require("mongoose");
const Classroom = require("../models/classroomSchema");
const connectDB = require("../config/db");

const updateClassroomLocation = async () => {
    try {
        await connectDB();

        const classroomName = process.env.SEED_CLASSROOM_NAME || "Room 101";
        const latitude = Number(process.env.SEED_CLASSROOM_LATITUDE);
        const longitude = Number(process.env.SEED_CLASSROOM_LONGITUDE);
        const radius = Number(process.env.SEED_CLASSROOM_RADIUS || 100);

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new Error("SEED_CLASSROOM_LATITUDE is missing or invalid in .env file");
        }

        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error("SEED_CLASSROOM_LONGITUDE is missing or invalid in .env file");
        }

        const classroom = await Classroom.findOneAndUpdate(
            {
                classroomName: classroomName
            },
            {
                latitude: latitude,
                longitude: longitude,
                radius: radius
            },
            {
                returnDocument: 'after'
            }
        );

        if (!classroom) {
            throw new Error("Classroom not found: " + classroomName);
        }

        console.log("Classroom location updated:", classroom.classroomName);

        await mongoose.connection.close();

    } catch (err) {
        console.log("UPDATE CLASSROOM LOCATION ERROR:");
        console.log(err.message);
        console.log(err.stack);

        await mongoose.connection.close();
    }
};

updateClassroomLocation();