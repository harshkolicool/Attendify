const mongoose = require("mongoose");

const studentAttendanceSnapshotSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true
        },

        fullName: {
            type: String,
            required: true
        },

        enrollmentNumber: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: ["PRESENT", "PENDING", "LATE", "ABSENT"],
            required: true
        },

        attendanceRecord: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceRecord"
        },

        markedAt: {
            type: Date,
            default: Date.now
        },

        verificationMethod: {
            type: String,
            enum: [
                "GEOLOCATION",
                "PASSKEY_GEOLOCATION",
                "TRUSTED_DEVICE_GEOLOCATION",
                "MANUAL",
                "AUTO_ABSENT"
            ],
            default: "GEOLOCATION"
        },

        distanceFromClassroom: {
            type: Number,
            default: 0
        }
    },
    {
        _id: false
    }
);

const liveDeviceSnapshotSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true
        },

        studentName: {
            type: String,
            default: "Student"
        },

        deviceId: {
            type: String,
            required: true
        },

        deviceLabel: {
            type: String,
            default: "Device"
        },

        enrollmentNumber: {
            type: String,
            default: ""
        },

        latitude: Number,
        longitude: Number,
        accuracy: Number,
        distance: Number,
        configuredRadius: Number,
        effectiveRadius: Number,
        uncertaintyAllowance: Number,
        inside: Boolean,
        status: {
            type: String,
            enum: ["INSIDE", "NEAR", "OUTSIDE", "POOR_ACCURACY", "UNKNOWN"],
            default: "UNKNOWN"
        },
        reasonCode: {
            type: String,
            default: ""
        },
        online: {
            type: Boolean,
            default: true
        },

        lastActiveAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: false
    }
);

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

    teacherGpsAccuracy: {
        type: Number
    },

    locationSource: {
        type: String,
        enum: ["TEACHER_GPS", "CLASSROOM_PRESET"],
        default: "TEACHER_GPS"
    },

    locationMeta: mongoose.Schema.Types.Mixed,

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

    scheduledEndTime: {
        type: Date
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

    expiredAt: {
        type: Date
    },

    absentsMarkedAt: {
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
    ],

    presentStudents: [studentAttendanceSnapshotSchema],

    absentStudents: [studentAttendanceSnapshotSchema],

    liveDevices: [liveDeviceSnapshotSchema],

    attendanceSummary: {
        totalPresent: {
            type: Number,
            default: 0
        },

        totalAbsent: {
            type: Number,
            default: 0
        },

        totalMarked: {
            type: Number,
            default: 0
        }
    },

    effectiveEndTime: {
        type: Date
    },

    wasReopenedAfterExtension: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

attendanceSessionSchema.index({
    college: 1,
    classGroup: 1,
    classroom: 1,
    subject: 1,
    startTime: 1
});

attendanceSessionSchema.index({
    schedule: 1,
    teacher: 1,
    startTime: 1
});

attendanceSessionSchema.index({
    isActive: 1,
    status: 1,
    endTime: 1
});

attendanceSessionSchema.index({
    college: 1,
    schedule: 1,
    startTime: 1,
    absentsMarkedAt: 1
});

attendanceSessionSchema.index({
    "liveDevices.student": 1,
    "liveDevices.deviceId": 1
});

const AttendanceSession = mongoose.models.AttendanceSession || mongoose.model(
    "AttendanceSession",
    attendanceSessionSchema
);

module.exports = AttendanceSession;
