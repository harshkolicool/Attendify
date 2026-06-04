const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

function isBcryptHash(value) {
    return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

async function hashPasswordIfNeeded(password) {
    if (!password || isBcryptHash(password)) {
        return password;
    }

    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

async function hashPasswordInUpdate() {
    const update = this.getUpdate();

    if (!update || Array.isArray(update)) {
        return;
    }

    if (
        update.$set &&
        Object.prototype.hasOwnProperty.call(update.$set, "password")
    ) {
        update.$set.password = await hashPasswordIfNeeded(update.$set.password);
    }

    if (Object.prototype.hasOwnProperty.call(update, "password")) {
        update.password = await hashPasswordIfNeeded(update.password);
    }

    this.setUpdate(update);
}

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
    if (!this.password) {
        return false;
    }

    if (isBcryptHash(this.password)) {
        return await bcrypt.compare(enteredPassword, this.password);
    }

    return enteredPassword === this.password;
};

const Teacher = mongoose.models.Teacher || mongoose.model("Teacher", teacherSchema);

module.exports = Teacher;