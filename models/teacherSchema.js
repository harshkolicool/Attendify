const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

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

    lastLogin: {
        type: Date
    }

}, {
    timestamps: true
});

teacherSchema.index(
    { college: 1, employeeId: 1 },
    { unique: true }
);

teacherSchema.pre("save", async function () {

    if (!this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

teacherSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const Teacher = mongoose.model("Teacher", teacherSchema);

module.exports = Teacher;