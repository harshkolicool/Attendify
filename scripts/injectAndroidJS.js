const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '../views');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const androidScriptInjection = `
    <script src="/js/androidEnhancements.js" defer></script>
</head>`;

walkDir(viewsDir, (filePath) => {
    if (filePath.endsWith('.ejs')) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('androidEnhancements.js') && content.includes('</head>')) {
            content = content.replace('</head>', androidScriptInjection);
            fs.writeFileSync(filePath, content);
            console.log('Injected Android JS into: ' + filePath);
        }
    }
});
