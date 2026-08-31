const mongoose = require("mongoose");
const {
    isBcryptHash,
    hashPasswordIfNeeded,
    hashPasswordInUpdate,
    comparePassword
} = require("../utils/passwordHelper");



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

        lastIpPrefix: {
            type: String
        },

        tokenRotatedAt: {
            type: Date
        },

        stepUpVerifiedAt: {
            type: Date
        },

        riskScore: {
            type: Number,
            default: 0
        },

        riskLevel: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "low"
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

    // Expiry for the auto-login token — null means no token or already expired
    autoLoginTokenExpiresAt: {
        type: Date,
        default: null
    },

    // Increment this to invalidate all previously issued auto-login tokens (rotation)
    autoLoginTokenVersion: {
        type: Number,
        default: 0
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
    return comparePassword(enteredPassword, this.password);
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
