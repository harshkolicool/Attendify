const mongoose = require("mongoose");
const {
    isBcryptHash,
    hashPasswordIfNeeded,
    hashPasswordInUpdate,
    comparePassword
} = require("../utils/passwordHelper");



const teacherSchema = new mongoose.Schema({

    fullName: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    employeeId: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    department: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    attendanceSessions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceSession"
        }
    ],

    role: {
        type: String,
        enum: ["TEACHER", "HOD", "ADMIN"],
        default: "TEACHER"
    },

    isBlocked: {
        type: Boolean,
        default: false
    },

    isDeleted: {
        type: Boolean,
        default: false
    },

    deletedAt: {
        type: Date
    },

    lastLogin: {
        type: Date
    },

    pushSubscriptions: [
        {
            endpoint: { type: String, required: true },
            expirationTime: { type: Date },
            keys: {
                p256dh: { type: String, required: true },
                auth: { type: String, required: true }
            }
        }
    ]

}, {
    timestamps: true
});

teacherSchema.index(
    { college: 1, employeeId: 1 },
    { unique: true }
);

teacherSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await hashPasswordIfNeeded(this.password);
});

teacherSchema.pre("updateOne", hashPasswordInUpdate);
teacherSchema.pre("findOneAndUpdate", hashPasswordInUpdate);
teacherSchema.pre("updateMany", hashPasswordInUpdate);

teacherSchema.methods.comparePassword = async function (enteredPassword) {
    return comparePassword(enteredPassword, this.password);
};

const Teacher = mongoose.models.Teacher || mongoose.model("Teacher", teacherSchema);

module.exports = Teacher;