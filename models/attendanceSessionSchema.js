const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema({

    schedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Schedule"
    },

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
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

    latitude: {
        type: Number
    },

    longitude: {
        type: Number
    },

    radius: {
        type: Number,
        default: 100
    },

    startTime: {
        type: Date,
        default: Date.now
    },

    endTime: {
        type: Date,
        required: true
    },

    status: {
        type: String,
        enum: ["ACTIVE", "CLOSED", "EXPIRED", "CANCELLED"],
        default: "ACTIVE"
    },

    isActive: {
        type: Boolean,
        default: true
    },

    closedAt: {
        type: Date
    },

    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher"
    },

    attendanceRecords: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceRecord"
        }
    ]

}, {
    timestamps: true
});

attendanceSessionSchema.index({
    schedule: 1
});

attendanceSessionSchema.index({
    college: 1,
    classGroup: 1,
    classroom: 1,
    subject: 1,
    startTime: 1
});

attendanceSessionSchema.index({
    teacher: 1,
    isActive: 1,
    status: 1
});

const AttendanceSession = mongoose.model(
    "AttendanceSession",
    attendanceSessionSchema
);

module.exports = AttendanceSession;