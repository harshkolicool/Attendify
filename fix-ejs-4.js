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

const varsToPrefix = [
    'classGroups', 'classrooms', 'admin', 'pendingPasskeyRequests', 'subjects', 'schedules',
    'students', 'teachers', 'formData', 'resetAdminPasswordResult', 'notifications',
    'selectedStatus', 'scheduleCards', 'manualDateBasePath', 'manualDatePreviousInput',
    'manualDateNextInput', 'unreadCount', 'requests', 'college', 'systemStats', 'unverifiedColleges',
    'passkeyRequests', 'trustedDeviceCount'
];

let mods = 0;
walk('./views').forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    varsToPrefix.forEach(v => {
        // match <%= var, <% if (var, <% var.forEach, <% !var, <%= var ?
        // replace with locals.var if not already locals.var or Object.keys(var)
        const regex = new RegExp(`(?<!locals\\.|\\w)(\\b${v}\\b)(?!\\s*:)`, 'g');
        content = content.replace(regex, `locals.${v}`);
    });
    
    // specifically handle "else if (message" in studentPasskeys.ejs
    content = content.replace(/else if \(message ===/g, 'else if (locals.message ===');

    if (content !== original) {
        fs.writeFileSync(file, content);
        mods++;
    }
});
console.log(`Mods: ${mods}`);
