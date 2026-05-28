const fs = require('fs');

function fix(file) {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    
    // studentSchedule.ejs
    content = content.replace(/const groups = weeklyScheduleGroups \|\| \[\];/g, 'const groups = typeof weeklyScheduleGroups !== "undefined" ? weeklyScheduleGroups : [];');
    content = content.replace(/const activeMap = activeSessionsBySchedule \|\| \{\};/g, 'const activeMap = typeof activeSessionsBySchedule !== "undefined" ? activeSessionsBySchedule : {};');
    content = content.replace(/const todaySessionMap = todaySessionsBySchedule \|\| \{\};/g, 'const todaySessionMap = typeof todaySessionsBySchedule !== "undefined" ? todaySessionsBySchedule : {};');
    content = content.replace(/const statusMap = attendanceStatusBySchedule \|\| \{\};/g, 'const statusMap = typeof attendanceStatusBySchedule !== "undefined" ? attendanceStatusBySchedule : {};');

    // studentDashboard.ejs
    content = content.replace(/const scheduleList = schedules \|\| \[\];/g, 'const scheduleList = typeof schedules !== "undefined" ? schedules : [];');
    content = content.replace(/const activeList = activeSessions \|\| \[\];/g, 'const activeList = typeof activeSessions !== "undefined" ? activeSessions : [];');
    content = content.replace(/const todaySessionList = todaySessions \|\| \[\];/g, 'const todaySessionList = typeof todaySessions !== "undefined" ? todaySessions : [];');
    content = content.replace(/const markedList = markedSessionIds \|\| \[\];/g, 'const markedList = typeof markedSessionIds !== "undefined" ? markedSessionIds : [];');
    content = content.replace(/const subjectSummary = dashboardSubjectSummary \|\| \[\];/g, 'const subjectSummary = typeof dashboardSubjectSummary !== "undefined" ? dashboardSubjectSummary : [];');

    // Safe hasPasskey / hasUsableTrustedDevice / today
    content = content.replace(/<% if \(!hasPasskey && !hasUsableTrustedDevice\) { %>/g, '<% if (typeof hasPasskey !== "undefined" && !hasPasskey && typeof hasUsableTrustedDevice !== "undefined" && !hasUsableTrustedDevice) { %>');
    content = content.replace(/<%= today %>/g, '<%= typeof today !== "undefined" ? today : "" %>');

    fs.writeFileSync(file, content);
}

fix('./views/studentSchedule.ejs');
fix('./views/studentDashboard.ejs');
console.log('Fixed student files safely.');
