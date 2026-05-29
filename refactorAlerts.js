const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        if (fs.statSync(dirPath).isDirectory()) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

const replaceRules = [
    {
        regex: /\balert\(([\s\S]*?)\)/g,
        replacement: 'uiAlert($1)'
    },
    {
        regex: /return confirm\(([\s\S]*?)\)/g,
        replacement: 'return uiConfirm(event, $1)'
    },
    {
        regex: /return confirmAdminDelete\(([\s\S]*?)\)/g,
        replacement: 'return uiConfirm(event, $1)'
    }
];

let changedCount = 0;

function processFile(filePath) {
    if (filePath.endsWith('.ejs') || filePath.endsWith('.js')) {
        // Skip our custom scripts
        if (filePath.includes('customAlerts.js')) return;
        
        let originalContent = fs.readFileSync(filePath, 'utf8');
        let content = originalContent;
        
        replaceRules.forEach(rule => {
            content = content.replace(rule.regex, rule.replacement);
        });
        
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content);
            console.log('Updated: ' + filePath);
            changedCount++;
        }
    }
}

walkDir('/Users/harshkoli/Attendify/views', processFile);
walkDir('/Users/harshkoli/Attendify/public', processFile);

console.log('Total files updated: ' + changedCount);
