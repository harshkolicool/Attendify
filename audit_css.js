const fs = require('fs');

const cssFiles = [
    'public/css/adminTheme.css',
    'public/css/teacherDashboard.css',
    'public/css/platformAdmin.css',
    'public/css/uiShell.css',
    'public/css/finalUiFix.css',
    'public/css/studentSchedule.css'
];

const lightBgRegex = /background(-color)?:\s*(#[fF]{3,6}|#fbfdff|#f8fafc|#f1f5f9|#f9fcff|#eff6ff|#f7fbff|#f0fdf4|#fef2f2)[^;]*;/gi;
const darkTextRegex = /color:\s*(#0f1f35|#1a2a42|#162842|#000|#000000|#333|#333333|#111|#111111)[^;]*;/gi;

for (const file of cssFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    
    console.log(`\n=== Analyzing ${file} ===`);
    
    // Simple block parser
    const blocks = content.match(/[^{]+{[^}]*}/g) || [];
    
    for (const block of blocks) {
        let hasLightBg = !!block.match(lightBgRegex);
        let hasDarkText = !!block.match(darkTextRegex);
        
        if (hasLightBg || hasDarkText) {
            const selectorMatch = block.match(/^([^{]+)\{/);
            if (selectorMatch) {
                const selector = selectorMatch[1].trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                if (!selector.includes('@') && !selector.includes('100%')) {
                    console.log(`[${hasLightBg ? 'BG' : ''}${hasLightBg && hasDarkText ? '+' : ''}${hasDarkText ? 'TXT' : ''}] ${selector}`);
                }
            }
        }
    }
}
