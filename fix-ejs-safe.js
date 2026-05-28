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
    // activePage in includes
    { regex: /\{ activePage: activePage \}/g, replacement: '{ activePage: typeof activePage !== "undefined" ? activePage : "" }' },
    { regex: /\{ activePage(: activePage)? \|\| "([^"]+)", teacher \}/g, replacement: '{ activePage: typeof activePage !== "undefined" ? activePage : "$2", teacher: typeof teacher !== "undefined" ? teacher : null }' },
    { regex: /\{ activePage,\s*student \}/g, replacement: '{ activePage: typeof activePage !== "undefined" ? activePage : "", student: typeof student !== "undefined" ? student : null }' },
    { regex: /\{ activePage,\s*teacher \}/g, replacement: '{ activePage: typeof activePage !== "undefined" ? activePage : "", teacher: typeof teacher !== "undefined" ? teacher : null }' },
    { regex: /\{ activePage \}/g, replacement: '{ activePage: typeof activePage !== "undefined" ? activePage : "" }' },
    
    // message and error in if conditions
    { regex: /<% if \(message\) { %>/g, replacement: '<% if (typeof message !== "undefined" && message) { %>' },
    { regex: /<% if \(error\) { %>/g, replacement: '<% if (typeof error !== "undefined" && error) { %>' },
    { regex: /<%= message %>/g, replacement: '<%= typeof message !== "undefined" ? message : "" %>' },
    { regex: /<%= error %>/g, replacement: '<%= typeof error !== "undefined" ? error : "" %>' },
    { regex: /message\.includes/g, replacement: 'message && message.includes' },
    { regex: /<% if \(message ===/g, replacement: '<% if (typeof message !== "undefined" && message ===' },
    { regex: /else if \(message ===/g, replacement: 'else if (typeof message !== "undefined" && message ===' },
    
    // flash messages
    { regex: /<% if \(flash\) { %>/g, replacement: '<% if (typeof flash !== "undefined" && flash) { %>' },

    // common dashboard things
    { regex: /<%= unreadCount %>/g, replacement: '<%= typeof unreadCount !== "undefined" ? unreadCount : 0 %>' },
    { regex: /<%= pendingRequestsCount %>/g, replacement: '<%= typeof pendingRequestsCount !== "undefined" ? pendingRequestsCount : 0 %>' },
    { regex: /<%= unverifiedColleges \? unverifiedColleges\.length : 0 %>/g, replacement: '<%= typeof unverifiedColleges !== "undefined" ? unverifiedColleges.length : 0 %>' },

    // passkey counts
    { regex: /<%= passkeyCount \|\| 0 %>/g, replacement: '<%= typeof passkeyCount !== "undefined" ? passkeyCount : 0 %>' },
    { regex: /<%= trustedDeviceCount \|\| 0 %>/g, replacement: '<%= typeof trustedDeviceCount !== "undefined" ? trustedDeviceCount : 0 %>' },

    // student variables
    { regex: /<%= student\.fullName/g, replacement: '<%= typeof student !== "undefined" && student.fullName' },
    { regex: /<%= student\.classGroup \?/g, replacement: '<%= typeof student !== "undefined" && student.classGroup ?' },
    { regex: /<%= student\.classGroup && student\.classGroup\.name \?/g, replacement: '<%= typeof student !== "undefined" && student.classGroup && student.classGroup.name ?' },
    { regex: /<%= student\.subjects \?/g, replacement: '<%= typeof student !== "undefined" && student.subjects ?' }
];

let mods = 0;
walk('./views').forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    replacements.forEach(r => {
        content = content.replace(r.regex, r.replacement);
    });

    if (content !== original) {
        fs.writeFileSync(file, content);
        mods++;
    }
});
console.log(`Mods: ${mods}`);
