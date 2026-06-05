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
        enum: ["PRESENT", "PENDING", "PENDING_REVIEW", "LATE", "ABSENT", "EXCUSED", "OUTSIDE_REJECTED", "REJECTED"],
        default: "PRESENT"
    },

    latitude: {
        type: Number
    },

    longitude: {
        type: Number
    },

    distanceFromClassroom: {
        type: Number,
        default: 0
    },

    verificationMethod: {
        type: String,
        enum: [
            "GEOLOCATION",
            "PASSKEY_GEOLOCATION",
            "TRUSTED_DEVICE_GEOLOCATION",
            "MANUAL",
            "AUTO_ABSENT",
            "AUTO_GPS",
            "GPS_WEAK_AUTO",
            "AUTO_GPS_REJECTED",
            "GPS_WEAK_TEACHER_REVIEW",
            "GPS_PERMISSION_TEACHER_REVIEW",
            "TEACHER_APPROVAL"
        ],
        default: "GEOLOCATION"
    },

    deviceInfo: {
        userAgent: {
            type: String
        },

        ip: {
            type: String
        },

        browserFingerprint: String,
        gpsAccuracy: Number,
        teacherGpsAccuracy: Number,
        measuredDistanceFromClassroom: Number,
        verifiedDistanceFromClassroom: Number,
        allowedRadius: Number,
        radiusUncertaintyAllowance: Number,
        minimumPossibleDistance: Number,
        passkeyCredentialId: String,
        locationMeta: mongoose.Schema.Types.Mixed
    },

    markedAt: {
        type: Date,
        default: Date.now
    },

    markedBy: {
        type: String,
        enum: ["STUDENT", "TEACHER", "ADMIN", "SYSTEM"],
        default: "STUDENT"
    },

    absenceType: {
        type: String,
        enum: ["AUTO_ABSENT", "MANUAL_ABSENT", null],
        default: null
    },

    autoAbsentAt: {
        type: Date
    },

    autoAbsentReason: {
        type: String
    },

    isFinalLocked: {
        type: Boolean,
        default: false
    },

    finalizedAt: {
        type: Date
    },

    effectiveEndTimeUsed: {
        type: Date
    },

    wasReopenedAfterExtension: {
        type: Boolean,
        default: false
    },

    wasAutoAbsentOverridden: {
        type: Boolean,
        default: false
    },

    autoAbsentOverriddenAt: {
        type: Date
    },

    overrideReason: {
        type: String
    },

    finalDistance: {
        type: Number
    },

    finalAccuracy: {
        type: Number
    },

    confidenceScore: {
        type: Number
    },

    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher"
    },

    approvedAt: {
        type: Date
    },

    reviewReason: {
        type: String
    },

    requestReview: {
        type: Boolean,
        default: false
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

const AttendanceRecord = mongoose.models.AttendanceRecord || mongoose.model(
    "AttendanceRecord",
    attendanceRecordSchema
);

module.exports = AttendanceRecord;
