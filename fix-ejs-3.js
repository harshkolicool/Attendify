const fs = require('fs');

function fix(file) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/locals\.filters \? locals\.filters\.subject : ""Id/g, 'locals.filters.subjectId');
    content = content.replace(/encodeURIComponent\(filters\.studentId\)/g, 'encodeURIComponent(locals.filters ? locals.filters.studentId : "")');
    content = content.replace(/encodeURIComponent\(filters\.status\)/g, 'encodeURIComponent(locals.filters ? locals.filters.status : "")');
    fs.writeFileSync(file, content);
}

fix('./views/teacherReports.ejs');
fix('./views/admin/reports.ejs');
fix('./views/studentAttendanceHistory.ejs');
