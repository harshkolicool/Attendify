const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        if (fs.statSync(file).isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ejs')) {
            results.push(file);
        }
    });
    return results;
}

const replacements = [
    { regex: /<%= classGroups\.length/g, replacement: '<%= locals.classGroups ? locals.classGroups.length : 0' },
    { regex: /<% classGroups\.forEach/g, replacement: '<% if (locals.classGroups) locals.classGroups.forEach' },
    { regex: /<%= classrooms\.length/g, replacement: '<%= locals.classrooms ? locals.classrooms.length : 0' },
    { regex: /<% if \(college\) { %>/g, replacement: '<% if (locals.college) { %>' },
    { regex: /<%= pendingPasskeyRequests \?/g, replacement: '<%= locals.pendingPasskeyRequests ?' },
    { regex: /filters\.fromDate/g, replacement: 'locals.filters ? locals.filters.fromDate : ""' },
    { regex: /filters\.toDate/g, replacement: 'locals.filters ? locals.filters.toDate : ""' },
    { regex: /filters\.subject/g, replacement: 'locals.filters ? locals.filters.subject : ""' },
    { regex: /const safeSchedules = locals\.schedules \|\| \[\];\n    const dayOrder = \[/g, replacement: 'const safeSchedules = locals.schedules || [];\n    const dayOrder = [' },
    { regex: /const studentGroupMap = \{\};\n\n    <% students\.forEach/g, replacement: 'const studentGroupMap = {};\n\n    <% if (locals.students) locals.students.forEach' },
    { regex: /<% students\.forEach/g, replacement: '<% if (locals.students) locals.students.forEach' },
    { regex: /<% if \(departments &&/g, replacement: '<% if (locals.departments &&' },
    { regex: /formData\.collegeName/g, replacement: '(locals.formData ? locals.formData.collegeName : "")' },
    { regex: /formData\.email/g, replacement: '(locals.formData ? locals.formData.email : "")' },
    { regex: /<% if \(flash\) { %>/g, replacement: '<% if (locals.flash) { %>' },
    { regex: /<%= unreadCount %>/g, replacement: '<%= locals.unreadCount || 0 %>' },
    { regex: /\{ activePage: locals\.activePage \|\| "([^"]+)", teacher \}/g, replacement: '{ activePage: locals.activePage || "$1", teacher: locals.teacher }' },
    { regex: /<%= schedules\.length/g, replacement: '<%= locals.schedules ? locals.schedules.length : 0' },
    { regex: /<% if \(message ===/g, replacement: '<% if (locals.message ===' },
    { regex: /const now = new Date\(\);\n    const currentDate = now\.getDate\(\);\n\n    let todayGroups = \[\];/g, replacement: 'const now = new Date();\n    const currentDate = now.getDate();\n    const safeScheduleCards = locals.scheduleCards || [];\n    let todayGroups = [];' }
];

let mods = 0;
walk('./views').forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    replacements.forEach(r => content = content.replace(r.regex, r.replacement));
    
    // Auto-replace remaining variable usage safely using a fallback for specific fields.
    content = content.replace(/\{ activePage,\s*student \}/g, '{ activePage: locals.activePage, student: locals.student }');
    content = content.replace(/\{ activePage,\s*teacher \}/g, '{ activePage: locals.activePage, teacher: locals.teacher }');

    if (content !== original) {
        fs.writeFileSync(file, content);
        mods++;
    }
});
console.log(`Mods: ${mods}`);
