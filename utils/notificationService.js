const mongoose = require("mongoose");
const Notification = require("../models/notificationSchema");

function toObjectIdOrNull(value) {
    if (!value) {
        return null;
    }

    const id = value._id ? value._id : value;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
    }

    return new mongoose.Types.ObjectId(id);
}

function buildNotificationPayload(notification) {
    if (!notification) {
        return null;
    }

    return {
        id: notification._id.toString(),
        _id: notification._id.toString(),
        recipientRole: notification.recipientRole,
        recipientUserId: notification.recipientUserId
            ? notification.recipientUserId.toString()
            : "",
        collegeId: notification.college ? notification.college.toString() : "",
        title: notification.title || "",
        message: notification.message || "",
        category: notification.category || "GENERAL",
        level: notification.level || "info",
        link: notification.link || "",
        isRead: Boolean(notification.isRead),
        readAt: notification.readAt || null,
        metadata: notification.metadata || null,
        createdAt: notification.createdAt || new Date()
    };
}

async function createNotification(input) {
    const document = await Notification.create({
        college: toObjectIdOrNull(input.college),
        recipientRole: input.recipientRole,
        recipientUserId: toObjectIdOrNull(input.recipientUserId),
        title: input.title,
        message: input.message,
        category: input.category || "GENERAL",
        level: input.level || "info",
        link: input.link || "",
        metadata: input.metadata || {},
        createdByType: input.createdByType || "system",
        createdById: toObjectIdOrNull(input.createdById)
    });

    return buildNotificationPayload(document.toObject());
}

async function getUnreadCount(filter) {
    const query = {
        recipientRole: filter.recipientRole,
        isRead: false
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    return Notification.countDocuments(query);
}

async function getRecentNotifications(filter, limit) {
    const query = {
        recipientRole: filter.recipientRole
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit || 40)
        .lean();

    return notifications.map(buildNotificationPayload);
}

async function markNotificationRead(notificationId, filter) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return null;
    }

    const query = {
        _id: notificationId,
        recipientRole: filter.recipientRole
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    const updated = await Notification.findOneAndUpdate(
        query,
        {
            $set: {
                isRead: true,
                readAt: new Date()
            }
        },
        {
            returnDocument: 'after'
        }
    ).lean();

    return buildNotificationPayload(updated);
}

async function markAllRead(filter) {
    const query = {
        recipientRole: filter.recipientRole,
        isRead: false
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    const result = await Notification.updateMany(query, {
        $set: {
            isRead: true,
            readAt: new Date()
        }
    });

    return result.modifiedCount || 0;
}

async function deleteNotification(notificationId, filter) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
        return 0;
    }

    const query = {
        _id: notificationId,
        recipientRole: filter.recipientRole
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    const result = await Notification.deleteOne(query);
    return result.deletedCount || 0;
}

async function clearAllNotifications(filter) {
    const query = {
        recipientRole: filter.recipientRole
    };

    if (filter.college) {
        query.college = filter.college;
    }

    if (filter.recipientUserId) {
        query.recipientUserId = filter.recipientUserId;
    }

    const result = await Notification.deleteMany(query);
    return result.deletedCount || 0;
}

module.exports = {
    createNotification,
    buildNotificationPayload,
    getUnreadCount,
    getRecentNotifications,
    markNotificationRead,
    markAllRead,
    deleteNotification,
    clearAllNotifications
};
