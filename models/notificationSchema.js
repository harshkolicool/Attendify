const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        college: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "College"
        },

        recipientRole: {
            type: String,
            enum: ["STUDENT", "TEACHER", "ADMIN", "PLATFORM_ADMIN"],
            required: true
        },

        recipientUserId: {
            type: mongoose.Schema.Types.ObjectId
        },

        title: {
            type: String,
            required: true,
            trim: true
        },

        message: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            default: "GENERAL",
            trim: true
        },

        level: {
            type: String,
            enum: ["info", "success", "warning", "danger"],
            default: "info"
        },

        link: {
            type: String,
            trim: true
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed
        },

        isRead: {
            type: Boolean,
            default: false
        },

        readAt: {
            type: Date
        },

        createdByType: {
            type: String,
            enum: ["student", "teacher", "platformAdmin", "system"],
            default: "system"
        },

        createdById: {
            type: mongoose.Schema.Types.ObjectId
        }
    },
    {
        timestamps: true
    }
);

notificationSchema.index({
    recipientRole: 1,
    recipientUserId: 1,
    isRead: 1,
    createdAt: -1
});

notificationSchema.index({
    college: 1,
    recipientRole: 1,
    isRead: 1,
    createdAt: -1
});

// Auto-expire read notifications after 30 days to keep the collection lean.
// sparse: true ensures unread notifications (readAt = null/undefined) are never deleted.
notificationSchema.index(
    { readAt: 1 },
    { expireAfterSeconds: 30 * 24 * 3600, sparse: true }
);

const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

module.exports = Notification;
