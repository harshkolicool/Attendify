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

const headInjection = `
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#4f46e5">
    <link rel="apple-touch-icon" href="/icon-192.png">
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js');
            });
        }
    </script>
</head>`;

walkDir(viewsDir, (filePath) => {
    if (filePath.endsWith('.ejs')) {
        let content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('rel="manifest"')) {
            content = content.replace('</head>', headInjection);
            fs.writeFileSync(filePath, content);
            console.log('Injected into: ' + filePath);
        }
    }
});
