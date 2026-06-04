function timeToMinutes(timeText) {
    if (!timeText || typeof timeText !== "string") {
        return null;
    }

    const rawTime = timeText.trim().toUpperCase();

    const twelveHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

    if (twelveHourMatch) {
        let hours = Number(twelveHourMatch[1]);
        const minutes = Number(twelveHourMatch[2]);
        const period = twelveHourMatch[3];

        if (
            Number.isNaN(hours) ||
            Number.isNaN(minutes) ||
            hours < 1 ||
            hours > 12 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        if (period === "AM" && hours === 12) {
            hours = 0;
        }

        if (period === "PM" && hours !== 12) {
            hours = hours + 12;
        }

        return hours * 60 + minutes;
    }

    const twentyFourHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);

    if (twentyFourHourMatch) {
        const hours = Number(twentyFourHourMatch[1]);
        const minutes = Number(twentyFourHourMatch[2]);

        if (
            Number.isNaN(hours) ||
            Number.isNaN(minutes) ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            return null;
        }

        return hours * 60 + minutes;
    }

    return null;
}

function sortSchedulesByTime(schedules) {
    schedules.sort(function (a, b) {
        const firstTime = timeToMinutes(a.startTime);
        const secondTime = timeToMinutes(b.startTime);

        if (firstTime === null && secondTime === null) {
            return 0;
        }

        if (firstTime === null) {
            return 1;
        }

        if (secondTime === null) {
            return -1;
        }

        return firstTime - secondTime;
    });

    return schedules;
}

function sortSchedulesByDayAndTime(schedules) {
    const dayOrder = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
    };

    schedules.sort(function (a, b) {
        const firstDay = dayOrder[a.day];
        const secondDay = dayOrder[b.day];

        const safeFirstDay = firstDay === undefined ? 99 : firstDay;
        const safeSecondDay = secondDay === undefined ? 99 : secondDay;

        if (safeFirstDay !== safeSecondDay) {
            return safeFirstDay - safeSecondDay;
        }

        const firstTime = timeToMinutes(a.startTime);
        const secondTime = timeToMinutes(b.startTime);

        if (firstTime === null && secondTime === null) {
            return 0;
        }

        if (firstTime === null) {
            return 1;
        }

        if (secondTime === null) {
            return -1;
        }

        return firstTime - secondTime;
    });

    return schedules;
}

function getTodayName() {
    const formatter = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        timeZone: 'Asia/Kolkata'
    });
    return formatter.format(new Date());
}

function getTodayRange() {
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    const parts = formatter.formatToParts(now);
    const dateObj = {};
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].type !== 'literal') {
            dateObj[parts[i].type] = parts[i].value;
        }
    }
    
    const startIso = dateObj.year + "-" + dateObj.month + "-" + dateObj.day + "T00:00:00.000+05:30";
    const endIso = dateObj.year + "-" + dateObj.month + "-" + dateObj.day + "T23:59:59.999+05:30";
    
    return {
        start: new Date(startIso),
        end: new Date(endIso)
    };
}

function getScheduleTimeStatus(startTime, endTime, currentDate) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    if (startMinutes === null || endMinutes === null) {
        return "invalid";
    }

    if (endMinutes <= startMinutes) {
        // Overnight schedules (e.g. 11:00 PM to 02:00 AM) are currently not supported
        // as they span across multiple days and break the single-day schedule logic.
        return "invalid";
    }

    const now = currentDate || new Date();
    
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(now);
    let hour = 0;
    let minute = 0;
    
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].type === 'hour') hour = parseInt(parts[i].value, 10);
        if (parts[i].type === 'minute') minute = parseInt(parts[i].value, 10);
    }
    
    if (hour === 24) hour = 0;

    const currentMinutes = (hour * 60) + minute;

    if (currentMinutes < startMinutes) {
        return "upcoming";
    }

    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        return "live";
    }

    return "ended";
}

module.exports = {
    timeToMinutes,
    sortSchedulesByTime,
    sortSchedulesByDayAndTime,
    getTodayName,
    getTodayRange,
    getScheduleTimeStatus
};