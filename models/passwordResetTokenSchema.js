const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "userType"
        },
        userType: {
            type: String,
            required: true,
            enum: ["Admin", "Teacher", "Student"]
        },
        token: {
            type: String,
            required: true,
            unique: true
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 3600 // Automatically deletes document after 1 hour
        }
    }
);

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
