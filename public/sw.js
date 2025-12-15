const CACHE_NAME = 'workspace-v1.1.0';
const OFFLINE_URL = '/offline.html';

// Static assets to cache immediately on install
const STATIC_CACHE = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// API endpoints to cache for offline access
const API_CACHE_PATTERNS = [
  /\/api\/jobdesks/,
  /\/api\/todos/,
  /\/api\/users/,
  /\/api\/daily-logs/,
  /\/api\/profile/,
  /\/api\/chat\/messages/,
  /\/api\/divisions/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v1.1.0...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE);
      })
      .catch(err => {
        console.error('[SW] Cache addAll error:', err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - smart caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the page for offline access
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Try to return cached page, fallback to offline page
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Handle API requests - Network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Check if this is a cacheable API endpoint
    const shouldCache = API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
    
    // Only cache GET requests
    if (request.method === 'GET' && shouldCache) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            return caches.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                console.log('[SW] Serving cached API response:', url.pathname);
                // Add header to indicate this is from cache
                const headers = new Headers(cachedResponse.headers);
                headers.set('X-From-Cache', 'true');
                return new Response(cachedResponse.body, {
                  status: cachedResponse.status,
                  statusText: cachedResponse.statusText,
                  headers: headers
                });
              }
              // Return offline error for failed API calls
              return new Response(
                JSON.stringify({ 
                  error: 'Offline - No cached data available',
                  offline: true 
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
          })
      );
    } else {
      // For non-GET or non-cacheable requests, just try network
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(
            JSON.stringify({ 
              error: 'You are offline. This action will be synced when back online.',
              offline: true,
              queued: true
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
      );
    }
    return;
  }

  // Handle static assets - Cache first with network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request).then((response) => {
        // Cache successful GET responses
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Background sync event - process offline queue
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

// Sync offline actions
async function syncOfflineActions() {
  console.log('[SW] Syncing offline actions...');
  
  // Notify all clients to process their offline queue
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ 
      type: 'SYNC_OFFLINE_ACTIONS',
      timestamp: Date.now()
    });
  }
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: 'Workspace',
    body: 'Ada pemberitahuan baru',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: 'workspace-notification',
    data: {}
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data,
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (event.notification.data?.url) {
              client.navigate(urlToOpen);
            }
            return;
          }
        }
        // Open new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    // Pre-cache additional URLs
    const urlsToCache = event.data.urls || [];
    caches.open(CACHE_NAME).then(cache => {
      cache.addAll(urlsToCache).catch(err => {
        console.error('[SW] Failed to cache additional URLs:', err);
      });
    });
  }
});

console.log('[SW] Service worker v1.1.0 loaded');
