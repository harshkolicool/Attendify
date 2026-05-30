const CACHE_NAME = 'attendify-v1';
const OFFLINE_URL = '/';

const ASSETS_TO_CACHE = [
    '/',
    '/css/style.css',
    '/js/geoAccuracy.js',
    '/js/locationStabilizer.js',
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
    // Phase 2: Offline Attendance Interception
    if (event.request.url.includes('/student/attendance/mark') && event.request.method === 'POST') {
        event.respondWith(
            fetch(event.request.clone()).catch(async (error) => {
                // If network fails (offline), intercept and save to IndexedDB
                console.log('[ServiceWorker] Offline, queuing attendance request...');
                const formData = await event.request.clone().text(); // URL Encoded or JSON depending on app
                await queueAttendanceRequest(formData);
                
                // Return a fake successful response so the frontend thinks it succeeded
                return new Response(JSON.stringify({
                    success: true,
                    message: "Offline mode: Attendance saved locally. Will sync when internet returns!"
                }), { headers: { 'Content-Type': 'application/json' } });
            })
        );
        return;
    }

    // Default Cache-First strategy for GET requests
    if (event.request.method === 'GET') {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match(OFFLINE_URL);
                    }
                });
            })
        );
    }
});

// IndexedDB Queue Logic
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AttendifyOfflineDB', 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore('attendance_queue', { autoIncrement: true });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function queueAttendanceRequest(data) {
    const db = await openDB();
    const tx = db.transaction('attendance_queue', 'readwrite');
    tx.objectStore('attendance_queue').add({
        data: data,
        timestamp: Date.now()
    });
    return new Promise((resolve) => {
        tx.oncomplete = resolve;
    });
}

async function syncOfflineAttendance() {
    const db = await openDB();
    const tx = db.transaction('attendance_queue', 'readonly');
    const store = tx.objectStore('attendance_queue');
    const request = store.getAll();
    
    request.onsuccess = async () => {
        const items = request.result;
        for (let item of items) {
            try {
                // Determine Content-Type based on the saved data format
                let contentType = 'application/json';
                if (typeof item.data === 'string' && item.data.includes('=')) {
                     contentType = 'application/x-www-form-urlencoded';
                }

                await fetch('/student/attendance/mark', {
                    method: 'POST',
                    headers: {
                        'Content-Type': contentType
                    },
                    body: item.data
                });
                
                // If successful, delete from DB
                const delTx = db.transaction('attendance_queue', 'readwrite');
                delTx.objectStore('attendance_queue').delete(item.id || item.timestamp);
                console.log('[ServiceWorker] Successfully synced offline attendance!');
            } catch (err) {
                console.log('[ServiceWorker] Sync failed, will try again later.', err);
            }
        }
    };
}

// Background Sync (Triggered when internet returns)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-attendance') {
        event.waitUntil(syncOfflineAttendance());
    }
});

// If Background Sync API is not supported (e.g. Safari), 
// we listen for message from the client window when it detects online
self.addEventListener('message', (event) => {
    if (event.data === 'trigger-sync') {
        syncOfflineAttendance();
    }
});
