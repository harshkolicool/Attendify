(function() {
    // Detect if we are running in an Android Capacitor WebView or Android Browser
    const isAndroid = /android/i.test(navigator.userAgent);
    const isCapacitor = window.Capacitor !== undefined;

    if (isAndroid || isCapacitor) {
        document.documentElement.classList.add('android-device');

        // Add Android-specific animations and styles
        const style = document.createElement('style');
        style.innerHTML = `
            /* Android Safe Areas */
            body.android-device {
                padding-top: env(safe-area-inset-top, 0px);
                padding-bottom: env(safe-area-inset-bottom, 0px);
                overflow-x: hidden;
            }
            
            /* Material Page Transitions */
            .android-device .auth-split,
            .android-device .app-layout {
                animation: androidSlideUp 0.4s cubic-bezier(0.05, 0.7, 0.1, 1) forwards;
                opacity: 0;
            }

            @keyframes androidSlideUp {
                0% { opacity: 0; transform: translateY(40px) scale(0.98); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }

            /* Material Ripple Effect for Buttons */
            .android-device .btn, .android-device .nav-links a {
                position: relative;
                overflow: hidden;
            }

            .android-device .btn::after, .android-device .nav-links a::after {
                content: "";
                display: block;
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                pointer-events: none;
                background-image: radial-gradient(circle, #fff 10%, transparent 10.01%);
                background-repeat: no-repeat;
                background-position: 50%;
                transform: scale(10, 10);
                opacity: 0;
                transition: transform .5s, opacity 1s;
            }

            .android-device .btn:active::after, .android-device .nav-links a:active::after {
                transform: scale(0, 0);
                opacity: 0.3;
                transition: 0s;
            }

            /* Better Touch Targets for Android */
            .android-device input, .android-device select, .android-device button {
                min-height: 54px !important; /* Increase touch target size */
            }
        `;
        document.head.appendChild(style);
        console.log('[Android Enhancements] Loaded Material animations and safe areas.');
    }
})();
