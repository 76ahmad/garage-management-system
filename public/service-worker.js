// Service Worker for Garage Management System PWA
const CACHE_NAME = 'garage-system-v39'; // ⬅️ غير هذا الرقم مع كل تحديث
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
  // ملاحظة: CDN files لن يتم تخزينها في الـ cache لتجنب مشاكل CORS
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing v26...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('[Service Worker] Cache addAll failed:', err);
          // Continue anyway - don't fail installation
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[Service Worker] Skip waiting...');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean old caches aggressively
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating v26...');
  event.waitUntil(
    Promise.all([
      // Delete ALL old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[Service Worker] Activated and claimed clients');
      // Notify all clients about the update
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: 'v26'
          });
        });
      });
    })
  );
});

// Fetch event - Network first for CDN, cache for local files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip Firebase and CDN requests - let them go direct to network
  if (url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('tailwindcss.com') ||
      url.hostname.includes('cloudflare.com')) {
    return event.respondWith(fetch(event.request));
  }
  
  // For same-origin requests, use cache-first strategy
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          
          return fetch(event.request).then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            
            // Clone and cache the response
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          });
        })
        .catch(error => {
          console.error('[Service Worker] Fetch failed:', error);
          return new Response('אין חיבור לאינטרנט - אנא בדוק את החיבור שלך', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain; charset=utf-8'
            })
          });
        })
    );
  }
});

// Background sync for offline data submission
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync:', event.tag);
  if (event.tag === 'sync-cars') {
    event.waitUntil(syncCarsData());
  }
});

async function syncCarsData() {
  try {
    // Implement your sync logic here
    console.log('[Service Worker] Syncing cars data...');
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
    return Promise.reject(error);
  }
}

// Push notification handler (optional)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'עדכון חדש זמין',
    icon: './icon-192.png',
    badge: './icon-72.png',
    vibrate: [200, 100, 200],
    dir: 'rtl',
    lang: 'he'
  };

  event.waitUntil(
    self.registration.showNotification('מערכת ניהול מוסך', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

// Listen for skip waiting message
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});