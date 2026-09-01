const puppeteer = require('puppeteer');

const VIEWPORTS = [
    { name: '4K Desktop', width: 2560, height: 1440 },
    { name: 'Widescreen Desktop', width: 1440, height: 900 },
    { name: 'Standard Desktop', width: 1200, height: 800 },
    { name: 'Tablet Landscape', width: 1024, height: 768 },
    { name: 'iPad / Tablet Portrait', width: 768, height: 1024 },
    { name: 'Large Mobile (Pixel 7 / iPhone Plus)', width: 412, height: 915 },
    { name: 'Standard Mobile (iPhone 13 / Galaxy)', width: 375, height: 812 },
    { name: 'Compact Mobile (Galaxy S8)', width: 360, height: 740 },
    { name: 'Tiny Mobile (iPhone SE)', width: 320, height: 568 }
];

async function runResponsiveTests() {
    console.log('🚀 Starting Automated Puppeteer Responsive Home Page Test Suite...\n');
    let browser;
    let totalErrors = 0;

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        page.on('pageerror', err => {
            consoleErrors.push(err.message);
        });

        for (const vp of VIEWPORTS) {
            console.log(`\n📐 Testing Viewport: ${vp.name} (${vp.width}x${vp.height}px)...`);
            await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
            await page.goto('http://localhost:5500/', { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Wait 250ms for layout stabilizer
            await new Promise(r => setTimeout(r, 250));

            // Check 1: Zero horizontal overflow
            const metrics = await page.evaluate(() => {
                const scrollW = document.documentElement.scrollWidth;
                const clientW = document.documentElement.clientWidth;
                const innerW = window.innerWidth;
                const hasOverflow = scrollW > innerW + 1; // 1px tolerance for subpixel rendering
                
                // Find overflowing elements if any
                let overflowingElements = [];
                if (hasOverflow) {
                    const all = document.querySelectorAll('*');
                    all.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > innerW + 2) {
                            overflowingElements.push({
                                tag: el.tagName,
                                class: el.className,
                                id: el.id,
                                right: Math.round(rect.right),
                                width: Math.round(rect.width)
                            });
                        }
                    });
                }

                return {
                    scrollW,
                    clientW,
                    innerW,
                    hasOverflow,
                    overflowingElements: overflowingElements.slice(0, 5)
                };
            });

            if (metrics.hasOverflow) {
                console.error(`  ❌ HORIZONTAL OVERFLOW DETECTED: scrollWidth (${metrics.scrollW}px) > innerWidth (${metrics.innerW}px)`);
                console.error('     Overflowing elements:', metrics.overflowingElements);
                totalErrors++;
            } else {
                console.log(`  ✅ Zero Horizontal Overflow: scrollWidth (${metrics.scrollW}px) <= windowWidth (${metrics.innerW}px)`);
            }

            // Check 2: Test Interactive Dashboard Tab Switching
            const tabs = ['map', 'biometric', 'acoustic', 'stream'];
            let tabsPassed = true;
            for (const tabName of tabs) {
                const tabButton = await page.$(`.dash-pill-tab[data-view="${tabName}"]`);
                if (tabButton) {
                    await tabButton.click();
                    await new Promise(r => setTimeout(r, 50));
                    const isActive = await page.evaluate((tab) => {
                        const view = document.getElementById(`dashView-${tab}`);
                        return view && view.classList.contains('active');
                    }, tabName);
                    if (!isActive) {
                        console.error(`  ❌ Tab '${tabName}' did not activate view screen!`);
                        tabsPassed = false;
                        totalErrors++;
                    }
                }
            }
            if (tabsPassed) {
                console.log(`  ✅ All 4 Dashboard Terminal Tabs switched smoothly.`);
            }

            // Check 3: If on mobile, test Mobile Navigation Menu Drawer toggle
            if (vp.width <= 980) {
                const menuBtn = await page.$('#homeMenuBtn');
                const navLinks = await page.$('#homeNavLinks');
                if (menuBtn && navLinks) {
                    await menuBtn.click();
                    await new Promise(r => setTimeout(r, 100));
                    const isOpen = await page.evaluate(() => {
                        const nav = document.getElementById('homeNavLinks');
                        return nav && nav.classList.contains('open');
                    });
                    if (isOpen) {
                        console.log(`  ✅ Mobile Navigation Drawer opened properly.`);
                    } else {
                        console.error(`  ❌ Mobile Navigation Drawer failed to open!`);
                        totalErrors++;
                    }

                    // Close menu
                    await menuBtn.click();
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        console.log('\n--- Console Errors Check ---');
        if (consoleErrors.length > 0) {
            console.error(`❌ Found ${consoleErrors.length} console errors:`, consoleErrors);
            totalErrors += consoleErrors.length;
        } else {
            console.log('✅ Zero unhandled JavaScript errors in console.');
        }

        console.log('\n======================================================');
        if (totalErrors === 0) {
            console.log('🎉 ALL RESPONSIVE TESTS PASSED (320px to 4K Desktop)!');
        } else {
            console.error(`⚠️ Found ${totalErrors} issue(s) during responsive testing.`);
        }
        console.log('======================================================\n');

    } catch (err) {
        console.error('Fatal test error:', err);
        totalErrors++;
    } finally {
        if (browser) await browser.close();
    }

    process.exit(totalErrors === 0 ? 0 : 1);
}

runResponsiveTests();
