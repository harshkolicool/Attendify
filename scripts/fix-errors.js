const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (fullPath.endsWith('.js')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk('./routes');

let replacedCount = 0;
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    content = content.replace(/res\.status\(\d+\)\.send\("([^"]+)"\s*\+\s*err\.message\)/g, 'res.status(500).send("$1" + "An internal server error occurred.")');

    // Also look for template literals like `Error: ${err.message}`
    content = content.replace(/res\.status\(\d+\)\.send\(`([^`$]+)\$\{err\.message\}`\)/g, 'res.status(500).send("$1" + "An internal server error occurred.")');

    // res.status(500).json({ success: false, message: err.message })
    content = content.replace(/message:\s*err\.message/g, 'message: "An internal server error occurred."');

    // Also check render:
    content = content.replace(/message:\s*err\.message/g, 'message: "An internal server error occurred."');

    if (content !== original) {
        fs.writeFileSync(file, content);
        replacedCount++;
    }
});

console.log("Replaced in files: ", replacedCount);
