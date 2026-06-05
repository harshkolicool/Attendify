document.addEventListener("DOMContentLoaded", function () {
    // Collect all schedule cards that have data-start-time and data-end-time
    const cards = document.querySelectorAll("[data-start-time][data-end-time]");
    if (cards.length === 0) return;

    function getNextTriggerTime() {
        const now = new Date();
        let nextTrigger = null;

        cards.forEach(card => {
            const startTimeStr = card.getAttribute("data-start-time");
            const endTimeStr = card.getAttribute("data-end-time");

            if (startTimeStr) {
                const startDate = parseTime(startTimeStr);
                if (startDate && startDate > now && (!nextTrigger || startDate < nextTrigger)) {
                    nextTrigger = startDate;
                }
            }

            if (endTimeStr) {
                const endDate = parseTime(endTimeStr);
                if (endDate && endDate > now && (!nextTrigger || endDate < nextTrigger)) {
                    nextTrigger = endDate;
                }
            }
        });

        return nextTrigger;
    }

    function parseTime(timeStr) {
        const raw = String(timeStr).trim().toUpperCase();
        const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
        const parts = raw.split(":");
        
        let hours = 0;
        let minutes = 0;

        if (amPmMatch) {
            hours = Number(amPmMatch[1]) % 12;
            minutes = Number(amPmMatch[2]);
            if (amPmMatch[3] === "PM") {
                hours += 12;
            }
        } else if (parts.length >= 2) {
            hours = Number(parts[0]);
            minutes = Number(parts[1]);
        } else {
            return null;
        }

        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date;
    }

    function scheduleNextReload() {
        const nextTrigger = getNextTriggerTime();
        if (!nextTrigger) return;

        const msUntilTrigger = nextTrigger.getTime() - Date.now();
        // Add 1 second to ensure we cross the boundary
        const timeoutMs = Math.max(1000, msUntilTrigger + 1000);

        // Cap timeout at 24 hours just in case
        if (timeoutMs > 24 * 60 * 60 * 1000) return;

        setTimeout(function() {
            window.location.reload();
        }, timeoutMs);
    }

    scheduleNextReload();
});
