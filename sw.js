/* ======================================================================
   Service Worker de MiViaje
   - Cache-first para el shell de la app (offline-first).
   - Versión de la app expuesta al cliente vía postMessage.
   ====================================================================== */

// La versión de la app: cambia este valor con cada release. Se envía al
// cliente (index.html) para mostrarla en el chip de versión dinámico.
const APP_VERSION = '1.28.0';

// El nombre del caché lleva la versión: al cambiar APP_VERSION, el SW
// considera obsoleto el caché anterior y lo purga en 'activate'.
const CACHE_NAME = 'miviaje-v' + APP_VERSION;

// Shell de la app (recursos del mismo origen que index.html).
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/favicon-32.png',
    './icons/favicon-16.png',
    './icons/apple-touch-icon.png'
];

// ---- Instalación: precachear el shell ----------------------------------
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            // addAll falla si algún recurso no existe; lo toleramos
            return cache.addAll(APP_SHELL).catch(function () {});
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// ---- Activación: purgar cachés antiguas y tomar el control -------------
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// ---- Fetch: cache-first, fallback a red, y cacheo de navigación --------
self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;
    // Solo gestionamos peticiones del mismo origen (recursos de la app);
    // las APIs externas (Firebase, Open-Meteo, OSRM, Nominatim...) pasan
    // siempre a la red para no romper la edición ni mostrar datos viejos.
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req).then(function (resp) {
                if (resp && resp.status === 200 && resp.type === 'basic') {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
                }
                return resp;
            }).catch(function () {
                // Si la red falla y no está en caché, devolver index.html
                // para que la SPA siga funcionando offline.
                if (req.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// ---- Mensajes del cliente: responder con la versión --------------------
self.addEventListener('message', function (event) {
    const data = event.data || {};
    if (data.type === 'GET_VERSION') {
        // Responder al cliente que preguntó
        event.source && event.source.postMessage({
            type: 'APP_VERSION',
            version: APP_VERSION,
            cacheName: CACHE_NAME
        });
    }
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Notificar a todos los clientes cuando el SW toma el control (útil para
// mostrar "nueva versión disponible" si se quisiera).
self.addEventListener('controllerchange', function () {
    // noop: los clientes preguntan la versión ellos mismos
});
