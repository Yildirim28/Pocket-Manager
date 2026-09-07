/* =============================================================
   Pocket Manager — sw.js (Service Worker)
   Caches the app shell for offline use and fast loads.
   Supabase API traffic always bypasses the cache.
   ============================================================= */

'use strict';

const CACHE_VERSION = 'pocket-manager-v2';

const PRECACHE_URLS = [
    './',
    './index.html',
    './app.html',
    './login.html',
    './signup.html',
    './settings.html',
    './contact.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './js/config.js?v=8',
    './js/site.js?v=16',
    './js/app.js?v=16',
    './js/auth.js?v=8',
    './js/settings.js?v=8',
    './js/contact.js?v=8'
];

/* ---------------- INSTALL: precache the app shell ---------------- */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

/* ---------------- ACTIVATE: purge old caches ---------------- */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
            )
            .then(() => self.clients.claim())
    );
});

/* ---------------- FETCH ---------------- */
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only intercept idempotent requests.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Supabase (database + auth) always goes to the network.
    // Cached API data would be stale and could break auth flows.
    if (url.hostname.endsWith('supabase.co')) return;

    // Page navigations: network-first so deploys propagate,
    // falling back to the cached page when offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() =>
                    caches
                        .match(request)
                        .then((cached) => cached || caches.match('./index.html'))
                )
        );
        return;
    }

    // Static assets (same-origin files, CDN scripts, fonts):
    // cache-first, refreshed in the background.
    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request)
                .then((response) => {
                    if (response && (response.ok || response.type === 'opaque')) {
                        const copy = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
