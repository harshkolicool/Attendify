const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ejs')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./views');
let modifications = 0;

const replacements = [
    { regex: /\{ activePage(: activePage)? \}/g, replacement: '{ activePage: locals.activePage }' },
    { regex: /\{ activePage: activePage \|\| ([^}]+) \}/g, replacement: '{ activePage: locals.activePage || $1 }' },
    { regex: /\{ activePage,\s*student \}/g, replacement: '{ activePage: locals.activePage, student: locals.student }' },
    { regex: /\{ activePage,\s*teacher \}/g, replacement: '{ activePage: locals.activePage, teacher: locals.teacher }' },
    { regex: /\{ activePage:\s*activePage,\s*student \}/g, replacement: '{ activePage: locals.activePage, student: locals.student }' },
    { regex: /\{ activePage:\s*activePage\s*\|\|\s*"([^"]+)",\s*teacher \}/g, replacement: '{ activePage: locals.activePage || "$1", teacher: locals.teacher }' },
    { regex: /<% if \(message\) { %>/g, replacement: '<% if (locals.message) { %>' },
    { regex: /<% if \(error\) { %>/g, replacement: '<% if (locals.error) { %>' },
    { regex: /<%= message %>/g, replacement: '<%= locals.message %>' },
    { regex: /<%= error %>/g, replacement: '<%= locals.error %>' },
    { regex: /message\.includes/g, replacement: 'locals.message && locals.message.includes' },
    { regex: /const dayOrder = \[/g, replacement: 'const safeSchedules = locals.schedules || [];\n    const dayOrder = [' },
    { regex: /activePage ===/g, replacement: 'locals.activePage ===' },
    { regex: /const classroomsMap = classroomsByClassGroup \|\| \{\};/g, replacement: 'const classroomsMap = locals.classroomsByClassGroup || {};' },
    { regex: /student && student\.fullName/g, replacement: 'locals.student && locals.student.fullName' },
    { regex: /teacher && teacher\.fullName/g, replacement: 'locals.teacher && locals.teacher.fullName' },
    { regex: /const scheduleCards = scheduleCards/g, replacement: 'const scheduleCards = locals.scheduleCards' },
    { regex: /const now = new Date\(\);\n    const currentDate = now.getDate\(\);\n\n    let todayGroups = \[\];/g, replacement: 'const now = new Date();\n    const currentDate = now.getDate();\n    const safeScheduleCards = locals.scheduleCards || [];\n    let todayGroups = [];' },
    { regex: /student\./g, replacement: 'locals.student.' },
    { regex: /teacher\./g, replacement: 'locals.teacher.' },
    { regex: /locals\.locals\./g, replacement: 'locals.' } // fix double locals
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    replacements.forEach(r => {
        content = content.replace(r.regex, r.replacement);
    });

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        modifications++;
    }
});

console.log(`Modified ${modifications} files.`);
