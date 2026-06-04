const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (fullPath.endsWith('.ejs')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walk('./views');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    const headInject = `
    <% if (typeof csrfToken !== "undefined") { %><meta name="csrf-token" content="<%= csrfToken %>"><% } %>
    <link rel="stylesheet" href="/css/uiShell.css">
    <link rel="stylesheet" href="/css/finalUiFix.css">
    <% if (typeof realtimeMode !== "undefined") { %>
    <script>
    window.AttendifyRealtimeConfig = {
        mode: <%- JSON.stringify(realtimeMode) %>,
        pollIntervalMs: <%= typeof realtimePollIntervalMs !== "undefined" ? realtimePollIntervalMs : 5000 %>
    };
    </script>
    <% } %>
`;

    if (content.includes("</head>")) {
        if (!content.includes('name="csrf-token"')) {
            content = content.replace("</head>", headInject + "</head>");
        }
    }

    if (content.includes("</body>")) {
        let bodyInject = `
    <script src="/js/csrfAuto.js" defer></script>
    <script src="/js/selectEnhancer.js" defer></script>
    <script src="/js/locationStabilizer.js"></script>
    <script src="/js/uiShell.js" defer></script>`;

        if ((content.includes("studentRealtime.js") || content.includes("/js/studentRealtime.js")) && !content.includes("studentLiveLocation.js")) {
            bodyInject += `\n    <script src="/js/studentLiveLocation.js"></script>`;
        }
        if (content.includes("teacherDashboard.css") && !content.includes("teacherNav.js")) {
            bodyInject += `\n    <script src="/js/teacherNav.js" defer></script>`;
        }
        if (content.includes("adminTheme.css") && !content.includes("adminRealtime.js")) {
            bodyInject += `\n    <script src="/js/adminRealtime.js"></script>`;
        }

        if (!content.includes('csrfAuto.js')) {
            content = content.replace("</body>", bodyInject + "\n</body>");
        }
    }

    if (content !== original) {
        fs.writeFileSync(file, content);
    }
});
console.log("Done");
