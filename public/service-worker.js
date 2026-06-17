const CACHE_NAME = 'attendify-v10';
const OFFLINE_URL = '/';

const ASSETS_TO_CACHE = [
    '/',
    '/css/style.css',
    '/css/uiShell.css',
    '/css/finalUiFix.css',
    '/css/adminTheme.css',
    '/css/teacherDashboard.css',
    '/css/studentSchedule.css',
    '/css/home.css',
    '/js/geoAccuracy.js',
    '/js/locationStabilizer.js',
    '/js/uiShell.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/favicon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Cache error', err));
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Handle network-first explicitly in client via fetch catch block
    // Network-First strategy for GET requests (always get latest if online)
    if (event.request.method === 'GET') {
        const url = new URL(event.request.url);
        // Exclude authentication routes from caching to prevent CSRF token issues
        if (url.pathname.includes('/login') || url.pathname.includes('/register')) {
            return; // Let the browser handle it normally (no SW interception)
        }

        event.respondWith(
            fetch(event.request).then((response) => {
                return response;
            }).catch(() => {
                // If offline, fallback to cache
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || (event.request.mode === 'navigate' ? caches.match(OFFLINE_URL) : undefined);
                });
            })
        );
    }
});

self.addEventListener('push', (event) => {
    let data = { title: "Attendify", body: "New notification", url: "/" };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});

