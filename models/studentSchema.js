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

const studentPasskeySchema = new mongoose.Schema(
    {
        credentialId: {
            type: String,
            required: true
        },

        credentialPublicKey: {
            type: Buffer,
            required: true
        },

        counter: {
            type: Number,
            default: 0
        },

        transports: [
            {
                type: String
            }
        ],

        deviceType: String,

        backedUp: {
            type: Boolean,
            default: false
        },

        name: {
            type: String,
            default: "Passkey"
        },

        registeredAt: {
            type: Date,
            default: Date.now
        },

        lastUsedAt: Date
    },
    {
        _id: false
    }
);

const trustedDeviceSchema = new mongoose.Schema(
    {
        deviceId: {
            type: String,
            required: true
        },

        tokenHash: {
            type: String,
            required: true
        },

        browserFingerprint: {
            type: String
        },

        userAgent: {
            type: String
        },

        registeredAt: {
            type: Date,
            default: Date.now
        },

        usableAfter: {
            type: Date
        },

        lastUsedAt: {
            type: Date
        },

        trustedByPasswordAt: {
            type: Date
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        _id: false
    }
);

const studentSchema = new mongoose.Schema({

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

    enrollmentNumber: {
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

    semester: {
        type: Number,
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

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    autoLoginToken: {
        type: String,
        default: null
    },

    passkeys: [studentPasskeySchema],
    trustedDevices: [trustedDeviceSchema],

    passkeySetupAllowedUntil: {
        type: Date
    },

    passkeySetupAllowedAt: {
        type: Date
    },

    trustedDeviceSetupAllowedUntil: {
        type: Date
    },

    trustedDeviceSetupAllowedAt: {
        type: Date
    },

    trustedDeviceSetupAllowedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher"
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

    isApproved: {
        type: Boolean,
        default: false
    },

    lastLocation: {
        latitude: { type: Number },
        longitude: { type: Number },
        accuracy: { type: Number },
        updatedAt: { type: Date }
    },

    lastLogin: {
        type: Date
    }

}, {
    timestamps: true
});

studentSchema.index(
    { college: 1, enrollmentNumber: 1 },
    { unique: true }
);

studentSchema.index(
    { "passkeys.credentialId": 1 },
    { sparse: true }
);

studentSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    this.password = await hashPasswordIfNeeded(this.password);
});

studentSchema.pre("updateOne", hashPasswordInUpdate);
studentSchema.pre("findOneAndUpdate", hashPasswordInUpdate);
studentSchema.pre("updateMany", hashPasswordInUpdate);

studentSchema.methods.comparePassword = async function (enteredPassword) {
    if (!this.password) {
        return false;
    }

    if (isBcryptHash(this.password)) {
        return await bcrypt.compare(enteredPassword, this.password);
    }

    return enteredPassword === this.password;
};

studentSchema.index({
    college: 1,
    classGroup: 1,
    isApproved: 1,
    isDeleted: 1
});

studentSchema.index({
    isDeleted: 1
});

studentSchema.index({
    isApproved: 1
});

const Student = mongoose.models.Student || mongoose.model("Student", studentSchema);

module.exports = Student;
