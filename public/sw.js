/**
 * Attendify Service Worker — PWA & Background Sync Engine
 * Enables zero-drop offline attendance syncing even after browser tab closes.
 */

const CACHE_NAME = "attendify-pwa-v1";
const STATIC_ASSETS = [
    "/css/style.css",
    "/js/acousticRadar.js",
    "/js/studentLocation.js",
    "/js/kalmanFilter.js",
    "/js/locationStabilizer.js"
];

// 1. Install & Cache
self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch(() => {});
        })
    );
});

// 2. Activate & Cleanup Old Caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Open IndexedDB for offline attendance queue
function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("AttendifyOfflineDB", 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("attendanceQueue")) {
                db.createObjectStore("attendanceQueue", { keyPath: "id", autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 4. Background Sync Handler
self.addEventListener("sync", (event) => {
    if (event.tag === "sync-attendance") {
        event.waitUntil(syncPendingAttendance());
    }
});

async function syncPendingAttendance() {
    try {
        const db = await openIndexedDB();
        const tx = db.transaction("attendanceQueue", "readonly");
        const store = tx.objectStore("attendanceQueue");
        const records = await new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });

        if (records.length === 0) return;

        for (const item of records) {
            try {
                const res = await fetch("/student/attendance/mark", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify(item.payload)
                });
                const data = await res.json();
                if (data.success || (data.message && data.message.includes("Already marked"))) {
                    // Remove from queue
                    const delTx = db.transaction("attendanceQueue", "readwrite");
                    delTx.objectStore("attendanceQueue").delete(item.id);
                }
            } catch (err) {
                console.warn("[SW Sync] Reconnection fetch failed, will retry on next online event:", err);
            }
        }
    } catch (e) {
        console.warn("[SW Sync] Error:", e);
    }
}
