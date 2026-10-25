/* ======================================================================
   Service Worker de MiViaje (PWA)
   - Precachea la interfaz (HTML, manifest, iconos)
   - Caché en tiempo de ejecución para SDK de Firebase, Tailwind y fuentes
   - Navegación: red primero con respaldo en caché (uso sin conexión)
   - Las APIs de datos (Firebase RTDB, Open-Meteo, OSRM) van siempre a la red
   Para publicar una versión nueva, cambia VERSION (p. ej. v2, v3…).
   ====================================================================== */
const VERSION = 'v1.20';
const CACHE_STATIC = 'miviaje-static-' + VERSION;
const CACHE_RUNTIME = 'miviaje-runtime-' + VERSION;
const APP_SHELL = './index.html';
const PRECACHE = [
    APP_SHELL,
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-32.png',
    './icons/favicon-16.png'
];
const CDN_RE = /(^|\.)(gstatic|googleapis|cdn\.tailwindcss)\.com$/;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('miviaje-') && k !== CACHE_STATIC && k !== CACHE_RUNTIME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }

    // APIs de datos: siempre red (nunca se sirven datos obsoletos de caché)
    if (url.hostname.endsWith('firebasedatabase.app') ||
        url.hostname.endsWith('open-meteo.com') ||
        url.hostname.endsWith('project-osrm.org')) {
        return;
    }

    // Navegación: red primero; sin conexión, la interfaz precacheada.
    // Solo se actualiza la caché del shell cuando la página navegada ES la app
    // (otras páginas del mismo origen, p. ej. ViajeEstatico.html, no deben pisarla).
    if (req.mode === 'navigate') {
        const esApp = url.pathname.endsWith('index.html') || /\/$/.test(url.pathname);
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (esApp && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_STATIC).then(c => c.put(APP_SHELL, copy));
                    }
                    return res;
                })
                .catch(() => caches.match(APP_SHELL))
        );
        return;
    }

    // Estáticos propios y CDNs (Firebase SDK, Tailwind, fuentes): caché primero,
    // con actualización en segundo plano para la próxima visita
    const esMismoOrigen = url.origin === self.location.origin;
    const esCDN = CDN_RE.test(url.hostname);
    if (esMismoOrigen || esCDN) {
        event.respondWith(
            caches.match(req).then(hit => {
                const net = fetch(req).then(res => {
                    if (res && (res.ok || res.type === 'opaque')) {
                        const copy = res.clone();
                        caches.open(CACHE_RUNTIME).then(c => c.put(req, copy));
                    }
                    return res;
                }).catch(() => hit);
                return hit || net;
            })
        );
    }
});
