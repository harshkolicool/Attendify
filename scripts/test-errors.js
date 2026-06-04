const fs = require('fs');
let content = fs.readFileSync('routes/adminRoutes.js', 'utf8');

const matches1 = content.match(/res\.status\(\d+\)\.send\(([^+]+)\s*\+\s*err\.message\)/g);
const matches2 = content.match(/res\.send\(err\.message\)/g);
const matches3 = content.match(/message:\s*err\.message/g);
const matches4 = content.match(/error:\s*err\.message/g);

console.log("Send + err.message: ", matches1 ? matches1.length : 0);
console.log("Send err.message: ", matches2 ? matches2.length : 0);
console.log("JSON message: err.message: ", matches3 ? matches3.length : 0);
console.log("JSON error: err.message: ", matches4 ? matches4.length : 0);
