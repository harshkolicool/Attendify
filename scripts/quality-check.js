const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const scanDirs = ["config", "controllers", "middlewares", "models", "public/js", "routes", "utils"];

function listJsFiles(dirPath) {
    if (!fs.existsSync(dirPath)) {
        return [];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            files.push(...listJsFiles(fullPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

function checkSyntax(filePath) {
    return spawnSync(process.execPath, ["--check", filePath], {
        encoding: "utf8"
    });
}

const filesToCheck = Array.from(
    new Set(
        [
            "app.js",
            "server.js",
            ...scanDirs.flatMap(function (dirName) {
                return listJsFiles(path.join(rootDir, dirName));
            })
        ].map(function (item) {
            return path.isAbsolute(item) ? item : path.join(rootDir, item);
        })
    )
).filter(function (filePath) {
    return fs.existsSync(filePath);
});

let hasErrors = false;

for (const filePath of filesToCheck) {
    const result = checkSyntax(filePath);

    if (result.status !== 0) {
        hasErrors = true;
        process.stdout.write(result.stderr || result.stdout || ("Syntax check failed for " + filePath + "\n"));
    }
}

if (hasErrors) {
    process.exit(1);
}

console.log("Syntax check passed for", filesToCheck.length, "files.");
