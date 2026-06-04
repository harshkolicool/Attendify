const fs = require('fs');

const files = ['public/css/uiShell.css', 'public/css/finalUiFix.css', 'public/css/adminTheme.css'];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let css = fs.readFileSync(file, 'utf8');

    // Replace backgrounds with gradients to flat colors
    css = css.replace(/background:\s*radial-gradient[^!]+!important;/g, 'background: var(--shell-bg) !important;');
    css = css.replace(/background:\s*radial-gradient[^{]+!important;/g, 'background: var(--shell-dark) !important;');
    
    // Replace linear gradients for active states
    css = css.replace(/background:\s*linear-gradient\([^)]+\)/g, 'background: var(--shell-primary)');
    
    // Clean up shadows
    css = css.replace(/--shell-shadow:\s*0 18px 52px[^;]+;/g, '--shell-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);');
    css = css.replace(/--shell-shadow-soft:\s*0 10px 28px[^;]+;/g, '--shell-shadow-soft: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);');

    // Remove text gradients if any
    css = css.replace(/-webkit-text-fill-color:\s*transparent;/g, '');
    css = css.replace(/-webkit-background-clip:\s*text;/g, '');
    css = css.replace(/background-clip:\s*text;/g, '');

    // Reset border radiuses to be slightly less bubbly if we want it professional
    // css = css.replace(/border-radius:\s*24px/g, 'border-radius: 12px');
    // css = css.replace(/border-radius:\s*18px/g, 'border-radius: 8px');
    // css = css.replace(/border-radius:\s*20px/g, 'border-radius: 10px');

    fs.writeFileSync(file, css);
});
console.log("CSS cleaned");
