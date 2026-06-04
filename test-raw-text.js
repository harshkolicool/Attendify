const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const ejs = fs.readFileSync('views/admin/students.ejs', 'utf8');

// Render EJS manually with dummy data
const ejsRender = require('ejs');
const rendered = ejsRender.render(ejs, {
    student: {
        _id: '123',
        fullName: 'Anushka',
        email: 'anushkadewangan08102006@gmail.com',
        enrollmentNumber: '92',
        department: 'AIML',
        semester: 2,
        classGroup: { name: 'AIML A', _id: '456' },
        passkeys: [],
        passkeySetupAllowedUntil: null,
        trustedDeviceSetupAllowedUntil: null
    },
    classGroups: [],
    departments: [],
    // ... we need other variables but this is too complex for a script. Let's just use regex on the raw EJS template text to see if there's any stray text.
});
