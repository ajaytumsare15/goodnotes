const CACHE_NAME = 'goodnotes-v2-optimized';
const RUNTIME_CACHE = 'goodnotes-runtime';
const CACHE_VERSION = 2;

// Static assets - cached on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './index-optimized.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/canvas.js',
  './js/tools.js',
  './js/paper.js',
  './js/storage.js',
  './js/export.js'
];

// Network-first resources (always try fresh, fallback to cache)
const NETWORK_FIRST = ['/api/', '/data/'];

// Cache-first resources (use cache, update in background)
const CACHE_FIRST = ['.js', '.css', '.woff2', '.png', '.jpg', '.webp'];

// Install: Pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Network-first for API calls
  if (NETWORK_FIRST.some(path => url.pathname.includes(path))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST.some(ext => url.pathname.endsWith(ext))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale-while-revalidate for HTML
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default: Cache-first with network fallback
  event.respondWith(cacheFirst(request));
});

// Strategy 1: Cache-first (fastest for static assets)
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Update cache in background
    fetchAndCache(request);
    return cached;
  }
  return fetchAndCache(request);
}

// Strategy 2: Network-first (freshest data)
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Strategy 3: Stale-while-revalidate (balance speed & freshness)
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetchAndCache(request);

  // Return cached immediately if available
  return cached || fetchPromise;
}

// Helper: Fetch and cache
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Fallback to offline page
    const cached = await caches.match('./index.html');
    return cached || new Response('Offline', { status: 503 });
  }
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notebook-data') {
    event.waitUntil(syncNotebookData());
  }
});

async function syncNotebookData() {
  // Future: Sync IndexedDB changes to cloud
  console.log('[SW] Background sync triggered');
}

// Push notifications support (future enhancement)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Goodnotes';
  const options = {
    body: data.body || 'New update available',
    icon: '/icon-192.png',
    badge: '/icon-badge.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
