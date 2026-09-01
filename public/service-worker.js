const CACHE_NAME = 'attendify-v12';
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
    '/js/kalmanFilter.js',
    '/js/locationStabilizer.js',
    '/js/acousticRadar.js',
    '/js/studentLocation.js',
    '/js/studentRealtime.js',
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
    if (event.request.method === 'GET') {
        const url = new URL(event.request.url);
        // Exclude authentication routes from caching to prevent CSRF token issues
        if (url.pathname.includes('/login') || url.pathname.includes('/register') || url.pathname.includes('/logout')) {
            return;
        }

        event.respondWith(
            fetch(event.request).then((response) => {
                // If it is a successful schedule, CSS, or JS asset response, cache a copy for offline use
                if (response && response.status === 200 && (
                    url.pathname.startsWith('/css/') ||
                    url.pathname.startsWith('/js/') ||
                    url.pathname.includes('/student/schedule') ||
                    url.pathname.includes('/student/dashboard')
                )) {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, cloned);
                    });
                }
                return response;
            }).catch(() => {
                // If offline, fallback to cached schedule or offline shell
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

