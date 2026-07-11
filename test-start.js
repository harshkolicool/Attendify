const http = require('http');
async function test() {
    console.log("Fetching login page...");
    let res = await fetch("http://localhost:5500/teacher/login");
    let text = await res.text();
    let csrf = text.match(/name="csrf-token"\s+content="([^"]+)"/)[1];
    let cookies = res.headers.getSetCookie();
    let cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
    
    let params = new URLSearchParams();
    params.append("email", "aditya@gmail.com");
    params.append("password", "1234567890");
    params.append("_csrf", csrf);
    
    console.log("Logging in...");
    let login = await fetch("http://localhost:5500/teacher/login", {
        method: "POST", body: params, headers: { "Cookie": cookieStr, "csrf-token": csrf }, redirect: "manual"
    });
    
    let loginCookies = login.headers.getSetCookie();
    if (loginCookies.length > 0) cookieStr = loginCookies.map(c => c.split(';')[0]).join('; ');
    
    console.log("Fetching dashboard...");
    let dash = await fetch("http://localhost:5500/teacher/dashboard", { headers: { "Cookie": cookieStr } });
    let dashHtml = await dash.text();
    
    let scheduleMatch = dashHtml.match(/name="scheduleId"\s+value="([^"]+)"/);
    if (!scheduleMatch) {
        console.log("No valid scheduleId found on dashboard!");
        return;
    }
    
    let schedId = scheduleMatch[1];
    console.log("Found Schedule ID:", schedId);
    
    let startParams = new URLSearchParams();
    startParams.append("_csrf", csrf);
    startParams.append("scheduleId", schedId);
    startParams.append("durationMinutes", "5");
    startParams.append("teacherLatitude", "12.9716");
    startParams.append("teacherLongitude", "77.5946");
    startParams.append("teacherAccuracy", "10");
    startParams.append("classroomRadius", "100");
    
    console.log("POSTing attendance start...");
    let startReq = await fetch("http://localhost:5500/teacher/attendance/start", {
        method: "POST",
        body: startParams,
        headers: { "Cookie": cookieStr, "csrf-token": csrf },
        redirect: "manual"
    });
    console.log("Start Class HTTP Status:", startReq.status);
    let startHtml = await startReq.text();
    console.log("Response text:", startHtml.substring(0, 100));
}
test().catch(console.error);
