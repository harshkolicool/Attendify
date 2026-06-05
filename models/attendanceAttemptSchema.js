const mongoose = require("mongoose");

const attendanceAttemptSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },

    studentName: {
        type: String,
        required: true
    },

    enrollmentNumber: {
        type: String,
        required: true
    },

    attendanceSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AttendanceSession",
        required: true
    },

    schedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Schedule"
    },

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher"
    },

    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject"
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

    result: {
        type: String,
        enum: ["SUCCESS", "REJECTED", "ERROR"],
        required: true
    },

    reasonCode: {
        type: String,
        required: true
    },

    reasonMessage: {
        type: String,
        required: true
    },

    studentLatitude: Number,
    studentLongitude: Number,
    teacherLatitude: Number,
    teacherLongitude: Number,

    distanceFromTeacher: {
        type: Number,
        default: 0
    },

    allowedRadius: {
        type: Number,
        default: 0
    },

    gpsAccuracy: {
        type: Number,
        default: 0
    },

    maxAllowedAccuracy: {
        type: Number,
        default: 100
    },

    effectiveRadius: {
        type: Number,
        default: 0
    },

    teacherAccuracy: {
        type: Number,
        default: 0
    },

    passkeyCredentialId: String,
    browserFingerprint: String,
    userAgent: String,
    ip: String,
    locationMeta: mongoose.Schema.Types.Mixed,

    confidenceScore: {
        type: Number,
        default: 0
    },

    decisionStatus: {
        type: String,
        default: ""
    },

    requestReview: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

attendanceAttemptSchema.index({ attendanceSession: 1, student: 1, createdAt: -1 });
attendanceAttemptSchema.index({ teacher: 1, createdAt: -1 });
attendanceAttemptSchema.index({ college: 1, result: 1, createdAt: -1 });

module.exports = mongoose.models.AttendanceAttempt || mongoose.model(
    "AttendanceAttempt",
    attendanceAttemptSchema
);