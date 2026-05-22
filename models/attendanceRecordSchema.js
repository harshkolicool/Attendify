const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema({

    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },

    attendanceSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AttendanceSession",
        required: true
    },

    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true
    },

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    classGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassGroup",
        required: true
    },

    classroom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Classroom",
        required: true
    },

    status: {
        type: String,
        enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"],
        default: "PRESENT"
    },

    latitude: {
        type: Number
    },

    longitude: {
        type: Number
    },

    distanceFromClassroom: {
        type: Number
    },

    verificationMethod: {
        type: String,
        enum: ["GEOLOCATION", "MANUAL"],
        default: "GEOLOCATION"
    },

    deviceInfo: {
        userAgent: {
            type: String
        },

        ip: {
            type: String
        }
    },

    markedAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});

attendanceRecordSchema.index(
    { student: 1, attendanceSession: 1 },
    { unique: true }
);

attendanceRecordSchema.index({
    college: 1,
    classGroup: 1,
    subject: 1,
    markedAt: 1
});

const AttendanceRecord = mongoose.model(
    "AttendanceRecord",
    attendanceRecordSchema
);

module.exports = AttendanceRecord;