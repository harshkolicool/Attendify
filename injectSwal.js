const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

const injection = `
    <!-- SweetAlert2 for Custom UI Alerts -->
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="/js/customAlerts.js"></script>
</head>`;

walkDir('/Users/harshkoli/Attendify/views', function(filePath) {
    if (filePath.endsWith('.ejs')) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('</head>') && !content.includes('sweetalert2')) {
            content = content.replace('</head>', injection);
            fs.writeFileSync(filePath, content);
            console.log('Injected into: ' + filePath);
        }
    }
});
