// Converts schedule time strings like "09:00 AM" to minutes from midnight
function timeToMinutes(timeString) {
    const parts = timeString.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!parts) {
        return null;
    }

    let hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const period = parts[3].toUpperCase();

    if (period === "PM" && hours !== 12) {
        hours = hours + 12;
    }

    if (period === "AM" && hours === 12) {
        hours = 0;
    }

    return hours * 60 + minutes;
}

function getCurrentMinutes(date) {
    const now = date || new Date();
    return now.getHours() * 60 + now.getMinutes();
}

// Returns: upcoming | live | ended
function getScheduleTimeStatus(startTime, endTime, date) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const currentMinutes = getCurrentMinutes(date);

    if (startMinutes === null || endMinutes === null) {
        return "unknown";
    }

    if (currentMinutes < startMinutes) {
        return "upcoming";
    }

    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        return "live";
    }

    return "ended";
}

function getTodayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

module.exports = {
    timeToMinutes,
    getCurrentMinutes,
    getScheduleTimeStatus,
    getTodayRange
};
